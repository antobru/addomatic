# Sistema multi-agente *swarm* in TypeScript — Guida completa

Questa guida accompagna l'implementazione contenuta nella cartella `swarm-agents/`.
Spiega cos'è un sistema *swarm*, come è costruito questo specifico progetto, come
eseguirlo, come estenderlo e cosa serve per portarlo in produzione.

---

## Indice

1. [Cos'è uno swarm e quando usarlo](#1-cosè-uno-swarm-e-quando-usarlo)
2. [Architettura del sistema](#2-architettura-del-sistema)
3. [Prerequisiti e setup](#3-prerequisiti-e-setup)
4. [Anatomia del codice, file per file](#4-anatomia-del-codice-file-per-file)
5. [Il loop ReAct](#5-il-loop-react)
6. [Le strategie di aggregazione a confronto](#6-le-strategie-di-aggregazione-a-confronto)
7. [Concorrenza e performance](#7-concorrenza-e-performance)
8. [Resilienza: retry, errori, soglie](#8-resilienza-retry-errori-soglie)
9. [Costi e scelta dei modelli](#9-costi-e-scelta-dei-modelli)
10. [Estendere il sistema](#10-estendere-il-sistema)
11. [Verso la produzione](#11-verso-la-produzione)
12. [Limiti noti](#12-limiti-noti)

---

## 1. Cos'è uno swarm e quando usarlo

Uno *swarm* è un pattern multi-agente **omogeneo**: invece di assegnare ruoli
diversi a agenti diversi (il pattern "supervisore + specialisti"), si lancia un
numero `N` di **copie dello stesso agente** sullo **stesso identico task**, in
modo indipendente e parallelo. Le `N` risposte vengono poi ridotte a una sola da
un componente chiamato **aggregatore**.

L'idea di fondo è la stessa dell'*ensemble* nel machine learning: molte stime
rumorose ma indipendenti, combinate, battono una singola stima. Un LLM a
temperatura > 0 è non-deterministico; su un problema difficile, alcuni dei suoi
tentativi sbaglieranno, ma se la maggioranza converge sulla risposta giusta, il
voto la fa emergere e scarta gli errori isolati.

**Quando lo swarm conviene:**

- Task con **alta varianza** nella risposta del singolo modello (ragionamenti a
  più passi, problemi logici/matematici, classificazioni difficili).
- Quando serve una **misura di confidenza**: l'accordo tra agenti indipendenti è
  un segnale diretto di affidabilità (5 agenti su 5 d'accordo ≫ 3 su 5).
- Quando il **costo di un errore** è alto e si è disposti a spendere più token
  per ridurlo.

**Quando NON conviene:**

- Task **deterministici o banali**: `N` copie daranno la stessa risposta,
  sprecando `N×` il costo.
- Task che richiedono **competenze diverse** in fasi diverse: lì serve un grafo
  di agenti specializzati (pipeline o supervisore), non uno swarm omogeneo.
- Quando la **latenza per singola chiamata** è già il collo di bottiglia e non
  c'è budget per la ridondanza.

> Regola pratica: lo swarm scambia **costo e token** in cambio di **accuratezza
> e robustezza**. Si paga `N` volte per sbagliare meno.

---

## 2. Architettura del sistema

Il sistema ha quattro componenti, ciascuno in un proprio file:

```
                        ┌──────────────────────────────┐
            task  ─────▶│            Swarm              │  (orchestratore)
                        │  fan-out  │  fan-in           │
                        └─────┬─────┴──────────▲────────┘
              ┌───────────────┼───────────────┐│
              ▼               ▼               ▼│
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │  Agent   │    │  Agent   │    │  Agent   │   N worker identici,
        │ (ReAct)  │    │ (ReAct)  │    │ (ReAct)  │   eseguiti in parallelo
        └────┬─────┘    └────┬─────┘    └────┬─────┘   (concorrenza limitata)
             │ tool          │ tool          │ tool
             ▼               ▼               ▼
        ┌────────────────────────────────────────┐
        │   strumenti (calculator, ...)           │
        └────────────────────────────────────────┘
             │ risultati (AgentResult[])
             ▼
        ┌────────────────────────────────────────┐
        │   Aggregator                            │
        │   • MajorityVote   • LLMJudge           │
        └─────────────────┬──────────────────────┘
                          ▼
                  risposta finale + confidenza + statistiche
```

| Componente   | File                | Responsabilità                                                        |
|--------------|---------------------|-----------------------------------------------------------------------|
| `Swarm`      | `src/swarm.ts`      | Orchestrazione: fan-out parallelo, soglie, fan-in verso l'aggregatore |
| `Agent`      | `src/agent.ts`      | Un worker autonomo che esegue il loop ReAct con retry                 |
| `Aggregator` | `src/aggregators.ts`| Riduce N risposte a una (voto di maggioranza o giudice LLM)           |
| utility      | `src/concurrency.ts`, `src/tools.ts`, `src/types.ts` | Pool di concorrenza, strumenti, tipi condivisi |

Il flusso è deliberatamente a senso unico: `Swarm` non microgestisce i passi di
ogni `Agent`; coordina solo i **confini** (avvio, raccolta, aggregazione). Ogni
agente è autonomo all'interno del suo loop.

---

## 3. Prerequisiti e setup

**Requisiti:**

- Node.js ≥ 20 (per il supporto ESM nativo e l'opzione `--env-file`).
- Una chiave API Anthropic (da <https://console.anthropic.com/settings/keys>).

**Installazione:**

```bash
cd swarm-agents
npm install
cp .env.example .env        # poi inserisci la tua chiave in .env
```

**Verifica che compili:**

```bash
npm run typecheck           # tsc --noEmit, deve uscire senza errori
```

**Esecuzione della demo:**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run example
```

oppure, tenendo la chiave nel file `.env`:

```bash
node --env-file=.env --import tsx examples/run-swarm.ts
```

L'SDK Anthropic legge automaticamente la variabile d'ambiente `ANTHROPIC_API_KEY`,
quindi nel codice basta `new Anthropic()` senza passare la chiave.

---

## 4. Anatomia del codice, file per file

### `src/types.ts` — il contratto

Definire i tipi per primi forza a ragionare sui confini tra moduli. I tipi
chiave:

- `AgentTool` — uno strumento: nome, descrizione (che il modello legge per
  decidere se usarlo), `input_schema` (JSON Schema degli argomenti) e una
  funzione `execute`.
- `AgentConfig` — configurazione condivisa da tutti i worker: modello, system
  prompt, strumenti, `temperature`, `maxTokens`, `maxIterations`.
- `AgentResult` — l'output di un agente: risposta finale, **traccia** completa
  del ragionamento, flag di successo, conteggio token, durata.
- `Aggregator` — l'interfaccia che ogni strategia di aggregazione implementa
  (`aggregate(task, results)`); permette di scambiare strategia senza toccare lo
  swarm.
- `SwarmConfig` / `SwarmResult` — input e output dell'orchestratore.

### `src/concurrency.ts` — il pool

`mapWithConcurrency(items, limit, fn)` esegue `fn` su tutti gli `items` tenendo
al massimo `limit` esecuzioni attive insieme, e **preserva l'ordine** dei
risultati. È un classico pool di worker: ogni worker pesca il prossimo indice
libero (`nextIndex++`) finché la lista non finisce. Senza questo limite, uno
swarm da 50 agenti aprirebbe 50 richieste simultanee e colpirebbe i rate limit.

### `src/agent.ts` — il worker

La classe `Agent` implementa il loop ReAct (dettagliato nella sezione 5). Tre
scelte di design importanti:

1. **Stateless di fatto.** Tutto lo stato di una esecuzione (l'array `messages`)
   vive *dentro* `run()`. Per questo lo `Swarm` può riusare **una sola** istanza
   `Agent` per tutti i worker paralleli: le esecuzioni non condividono stato e
   non interferiscono.
2. **Non lancia mai eccezioni verso l'esterno.** Qualsiasi errore (di rete, di
   tool, di limite iterazioni) viene catturato e tradotto in un `AgentResult`
   con `success: false`. Così il fallimento di un agente non fa cadere lo swarm.
3. **Retry con backoff** nel metodo privato `callModel`: ritenta solo gli errori
   transitori (HTTP 429 e 5xx) con attese crescenti (1s, 2s, 4s, 8s) più un
   *jitter* casuale per evitare che tutti gli agenti ritentino nello stesso
   istante.

### `src/aggregators.ts` — il fan-in

Due implementazioni dell'interfaccia `Aggregator`:

- `MajorityVoteAggregator` — normalizza ogni risposta in una "chiave di voto",
  conta le occorrenze, restituisce la più frequente. La `confidence` è la
  frazione di agenti d'accordo. **Costo zero** (nessuna chiamata API).
- `LLMJudgeAggregator` — passa tutti i candidati a un modello giudice che li
  valuta e o ne **sceglie** uno o ne **sintetizza** uno nuovo. Risponde in JSON
  (parsato in modo tollerante con `safeParseJSON`, che tollera fence markdown e
  preamboli).

Le funzioni `defaultNormalize` ed `extractAfterMarker` aiutano il voto: la
seconda estrae il valore dopo un marcatore `ANSWER:`, così si vota solo sulla
risposta finale e non sull'intero ragionamento intorno.

### `src/swarm.ts` — l'orchestratore

`Swarm.run(task)` fa tre cose: (1) **fan-out** dei worker via
`mapWithConcurrency`; (2) controllo della **soglia minima di successi**
(`minSuccesses`); (3) **fan-in** delegando all'aggregatore. Raccoglie anche le
statistiche aggregate (token totali, successi/fallimenti, tempo reale).

### `src/tools.ts` e `examples/run-swarm.ts`

Uno strumento di esempio (`calculatorTool`) e una demo con due scenari, uno per
ciascuna strategia di aggregazione.

---

## 5. Il loop ReAct

Ogni agente non fa una singola chiamata al modello: esegue un ciclo
**Reason + Act**. In pseudocodice:

```
messages = [ { user: task } ]
ripeti (fino a maxIterations):
    risposta = modello(messages, tools)
    se risposta NON contiene tool_use:
        → è la risposta finale, esci
    altrimenti:
        aggiungi la risposta dell'assistant a messages
        per ogni tool_use richiesto:
            esegui il tool → ottieni un risultato (observation)
        aggiungi i risultati a messages come messaggio user
```

Tradotto nei termini dell'API Messages di Anthropic:

1. Si chiama `messages.create` passando `tools`.
2. Se `stop_reason === 'tool_use'`, la risposta contiene blocchi `tool_use` con
   `name` e `input`. Si esegue ogni tool e si rispedisce un blocco `tool_result`
   (con lo stesso `tool_use_id`) dentro un nuovo messaggio `user`.
3. Si ripete finché il modello produce una risposta **solo testuale**
   (`stop_reason` diverso da `tool_use`): quella è l'output finale.

Il tetto `maxIterations` è una **rete di sicurezza**: senza, un modello che entra
in un loop di tool call potrebbe non fermarsi mai. Raggiungere il tetto è trattato
come fallimento controllato (`success: false`).

La **traccia** (`AgentResult.trace`) registra ogni passo — pensiero, tool call,
observation, risposta finale. È preziosa per il debug ("perché l'agente 3 ha
risposto diversamente?") e per l'audit.

---

## 6. Le strategie di aggregazione a confronto

È la decisione di design più importante dello swarm. La scelta dipende dalla
**forma della risposta**.

| Aspetto                | `MajorityVoteAggregator`            | `LLMJudgeAggregator`                       |
|------------------------|-------------------------------------|--------------------------------------------|
| Adatto a               | output discreti/verificabili        | output aperti (testo, codice, ragionamenti)|
| Come decide            | frequenza (la risposta più comune)  | qualità (un modello la valuta)             |
| Costo extra            | nessuno (pura logica)               | una chiamata API al modello giudice        |
| Deterministico         | sì                                  | no (è un LLM)                              |
| Misura di confidenza   | frazione di consenso                | stima dichiarata dal giudice               |
| Rischio                | richiede risposte confrontabili     | il giudice può sbagliare/avere bias        |

**Voto di maggioranza** brilla quando la risposta è un numero, una classe, una
scelta tra opzioni: lì "uguale" è ben definito e contare ha senso. Il trucco per
renderlo efficace su output testuali è **vincolare il formato finale** (es.
"concludi con `ANSWER: <valore>`") e votare solo su quella parte — esattamente
ciò che fa `extractAfterMarker` nello scenario 1 della demo.

**Giudice LLM** serve quando ogni agente produce un testo diverso e "contare" non
ha senso: una tagline, un paragrafo, una funzione. Due modalità:

- `synthesize: false` → il giudice **sceglie** il candidato migliore.
- `synthesize: true` → il giudice **fonde** gli elementi migliori in una risposta
  nuova (usato nello scenario 2 della demo).

> Si possono anche **combinare**: prima un voto di maggioranza per raggruppare le
> risposte concordi, poi un giudice solo sui gruppi distinti. Oppure pesare i
> voti per la confidenza del singolo agente (vedi sezione 10).

---

## 7. Concorrenza e performance

Il valore dello swarm in termini di **latenza** dipende dall'esecuzione
parallela. Con `concurrency = size`, tutti i worker partono insieme e il tempo
reale (`stats.wallClockMs`) è circa quello dell'agente **più lento**, non la
somma di tutti. Per questo lo `SwarmResult` riporta sia il tempo reale sia i
token totali: la differenza tra i due rende evidente il guadagno del parallelismo.

Linee guida pratiche:

- Tieni `concurrency` **sotto i limiti di richieste al minuto** del tuo account.
  Se hai 60 RPM e ogni agente fa ~3 chiamate, uno swarm da 20 con concorrenza 20
  può saturare il limite in pochi secondi: meglio `concurrency: 5–10`.
- Più worker → confidenza più stabile ma rendimenti decrescenti. Spesso `5–9`
  agenti (numero **dispari**, per evitare pareggi nel voto) è un buon compromesso.
- I worker dovrebbero usare il modello **più economico e veloce** adeguato al
  task (es. Haiku): la robustezza viene dal *numero*, non dalla potenza del
  singolo.

---

## 8. Resilienza: retry, errori, soglie

Tre livelli di difesa, dal più interno al più esterno:

1. **Retry sulla chiamata** (`Agent.callModel`): backoff esponenziale + jitter
   sui soli errori transitori (429, 5xx). Gli errori 4xx "definitivi" (es.
   richiesta malformata) **non** vengono ritentati.
2. **Isolamento del fallimento** (`Agent.run`): qualunque errore diventa un
   `AgentResult { success: false, error }`. Un agente che muore non trascina gli
   altri.
3. **Soglia di swarm** (`Swarm`, opzione `minSuccesses`): se troppi agenti
   falliscono, lo swarm lancia un errore invece di aggregare su dati troppo
   pochi. Meglio fallire forte che restituire una risposta basata su un solo
   sopravvissuto.

Gli aggregatori, dal canto loro, considerano solo i candidati con
`success === true` e gestiscono i casi limite (zero candidati validi, un solo
candidato).

---

## 9. Costi e scelta dei modelli

Lo swarm costa **circa `N` volte** un singolo agente (più una chiamata per il
giudice LLM, se usato). La leva principale per contenere la spesa è la **scelta
del modello dei worker**.

Modelli attualmente disponibili (verifica sempre nomi e disponibilità nella
[documentazione ufficiale](https://docs.claude.com/en/docs/about-claude/models/overview)):

| Modello              | Profilo                                              | Ruolo tipico nello swarm |
|----------------------|------------------------------------------------------|--------------------------|
| `claude-haiku-4-5`   | il più veloce ed economico                           | **worker** (i molti)     |
| `claude-sonnet-4-6`  | miglior equilibrio velocità/intelligenza, 1M contesto| worker "premium" o giudice |
| `claude-opus-4-8`    | il più capace, 1M contesto, 128k token di output     | **giudice** / task complessi |

Strategia consigliata: **molti worker economici + un giudice forte**. Si paga la
ridondanza al prezzo più basso e si concentra la spesa nel singolo passo
(l'aggregazione) dove la qualità conta di più.

> I prezzi cambiano spesso: per i costi per milione di token aggiornati consulta
> la [pagina pricing ufficiale](https://www.anthropic.com/pricing). Per stimare
> in anticipo, leggi `stats.totalInputTokens` e `stats.totalOutputTokens` che lo
> swarm già riporta a ogni run.

---

## 10. Estendere il sistema

L'architettura è pensata per essere estesa senza riscrivere il nucleo.

### Aggiungere un nuovo strumento

Basta un oggetto conforme a `AgentTool` e passarlo in `agent.tools`:

```ts
import type { AgentTool } from '../src/index.js';

export const searchTool: AgentTool = {
  name: 'web_search',
  description: 'Cerca sul web e restituisce i primi risultati.',
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Query di ricerca' } },
    required: ['query'],
  },
  execute: async (input) => {
    const results = await miaRicerca(String(input.query));
    return JSON.stringify(results);
  },
};
```

Il loop ReAct dell'agente lo userà automaticamente quando il modello lo riterrà
utile.

### Scrivere un nuovo aggregatore

Implementa l'interfaccia `Aggregator`. Esempio: **voto pesato** dalla confidenza
dichiarata da ogni agente (se i worker terminano con `CONFIDENCE: 0.8`):

```ts
import type { Aggregator, AggregationResult, AgentResult } from '../src/index.js';

export class WeightedVoteAggregator implements Aggregator {
  readonly name = 'weighted_vote';
  constructor(
    private normalize: (s: string) => string,
    private weightOf: (r: AgentResult) => number,
  ) {}

  async aggregate(_task: string, results: AgentResult[]): Promise<AggregationResult> {
    const scores: Record<string, number> = {};
    const repr: Record<string, string> = {};
    let total = 0;
    for (const r of results.filter((x) => x.success)) {
      const key = this.normalize(r.output);
      const w = this.weightOf(r);
      scores[key] = (scores[key] ?? 0) + w;
      total += w;
      if (!(key in repr)) repr[key] = r.output.trim();
    }
    const [bestKey, bestScore] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    return {
      output: repr[bestKey] ?? '',
      strategy: this.name,
      confidence: total > 0 ? bestScore / total : 0,
    };
  }
}
```

Altre idee di aggregazione: **clustering per similarità** (calcolare gli
embedding delle risposte, raggruppare quelle vicine e votare i cluster) per
gestire risposte semanticamente equivalenti ma formulate diversamente.

### Worker eterogenei

Lo swarm attuale è omogeneo per scelta. Per uno swarm "misto" (es. metà Haiku,
metà Sonnet) basterebbe generalizzare `Swarm` ad accettare un array di
`AgentConfig` e istanziare un `Agent` per configurazione.

---

## 11. Verso la produzione

L'implementazione è didattica ma solida. Prima di metterla in produzione,
considera:

- **Timeout per agente.** Aggiungi un `AbortController` con timeout a
  `messages.create`, così un singolo agente lento non blocca lo swarm oltre una
  soglia.
- **Osservabilità.** Logga `trace`, token e durate verso il tuo sistema di
  tracing (OpenTelemetry, ecc.). Le statistiche aggregate sono già pronte in
  `SwarmResult.stats`.
- **Validazione dell'output.** Per output strutturati, valida la risposta finale
  con uno schema (es. `zod`) prima di restituirla. Valuta anche gli *structured
  outputs* dell'API per garantire il formato.
- **Idempotenza e budget.** Imponi un tetto massimo di token/costo per run e
  interrompi se superato. Per richieste massive non interattive, valuta la
  *Message Batches API* (sconto sul prezzo, latenza maggiore).
- **Human-in-the-loop.** Per azioni irreversibili (invio email, scrittura su DB,
  pagamenti) inserisci un punto di conferma umana: l'autonomia va calibrata sul
  rischio, non massimizzata sempre.
- **Sicurezza dei tool.** Sostituisci il `Function(...)` della calcolatrice
  d'esempio con un vero parser (`mathjs`); applica una whitelist rigorosa di
  azioni e permessi a ogni strumento; non passare segreti nei prompt.
- **Gestione del contesto.** Se i task crescono, passa a ogni agente solo il
  sottoinsieme di contesto rilevante (eventualmente via recupero semantico),
  non tutto lo stato.

---

## 12. Limiti noti

- **Costo.** È il prezzo del pattern: `N×` token. Usalo dove l'accuratezza
  ripaga la spesa.
- **Errori correlati.** Lo swarm assume **indipendenza** tra gli agenti. Se tutti
  condividono lo stesso bias del modello, possono sbagliare *all'unisono*: il
  voto conferma l'errore invece di correggerlo. Aumentare la temperatura e/o
  diversificare i prompt o i modelli mitiga, non elimina.
- **Voto su testo libero.** Senza un formato finale vincolato, il voto di
  maggioranza degenera (ogni risposta è unica → tutte con un voto). Per il testo
  aperto usa il giudice LLM.
- **Il giudice non è infallibile.** È pur sempre un LLM: può preferire la risposta
  sbagliata. Per i task critici, abbinalo a controlli verificabili.

---

### Riepilogo

Questo progetto mostra uno swarm minimale ma completo: agenti autonomi (loop
ReAct con tool e retry), eseguiti in parallelo con concorrenza controllata, le
cui risposte vengono ridotte a una da due strategie di aggregazione complementari.
Il nucleo è piccolo e tipizzato; le estensioni (nuovi tool, nuovi aggregatori,
worker eterogenei) si innestano senza toccarlo. Parti dalla demo in
`examples/run-swarm.ts`, poi adatta `SwarmConfig` al tuo caso d'uso.
