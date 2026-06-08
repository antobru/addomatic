/**
 * aggregators.ts
 * --------------
 * La fase che rende uno "swarm" piu' affidabile di un singolo agente: ridurre
 * N risposte indipendenti a una sola. Due strategie complementari.
 *
 *  - MajorityVoteAggregator: normalizza e conta le risposte; vince la piu'
 *    frequente. Robusto, deterministico, a costo zero (nessuna chiamata API).
 *    Ideale per output discreti/verificabili (numeri, classi, scelte).
 *
 *  - LLMJudgeAggregator: passa tutti i candidati a un modello "giudice" che
 *    sceglie il migliore o ne sintetizza uno nuovo. Adatto a output aperti
 *    (testo libero, codice, ragionamenti) dove il confronto esatto non basta.
 *    Costa una chiamata API in piu', ma giudica la qualita', non la frequenza.
 *    Accetta qualsiasi LLMProvider: il giudice puo' essere un modello diverso
 *    dagli agenti worker (es. worker su Ollama, giudice su Claude Opus).
 */
import type { LLMProvider } from './providers/types.js';
import type { AggregationResult, Aggregator, AgentResult } from '../types.js';

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Normalizzazione di default: minuscolo, niente punteggiatura ai bordi,
 * spazi collassati. Serve a far coincidere risposte "uguali" scritte in modo
 * leggermente diverso ("42." vs "42" vs " 42 ").
 */
export function defaultNormalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^[\s.,;:!?"'()]+|[\s.,;:!?"'()]+$/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Estrae il valore dopo un marcatore "ANSWER:" (case-insensitive). Se i worker
 * vengono istruiti a terminare con "ANSWER: <valore>", il voto di maggioranza
 * confronta solo la risposta finale e non tutto il ragionamento intorno.
 */
export function extractAfterMarker(marker = 'ANSWER:') {
  const re = new RegExp(`${marker}\\s*(.+?)\\s*$`, 'is');
  return (s: string): string => {
    const m = s.match(re);
    return defaultNormalize(m?.[1] ?? s);
  };
}

/* -------------------------------------------------------------------------- */

export class MajorityVoteAggregator implements Aggregator {
  readonly name = 'majority_vote';

  /** @param normalize funzione che riduce una risposta alla sua "chiave di voto". */
  constructor(private readonly normalize: (s: string) => string = defaultNormalize) {}

  async aggregate(_task: string, results: AgentResult[]): Promise<AggregationResult> {
    const ok = results.filter((r) => r.success && r.output.trim());

    const votes: Record<string, number> = {};
    const representative: Record<string, string> = {};

    for (const r of ok) {
      const key = this.normalize(r.output);
      votes[key] = (votes[key] ?? 0) + 1;
      // Conserva una versione leggibile della prima risposta di ogni gruppo.
      if (!(key in representative)) representative[key] = r.output.trim();
    }

    let bestKey = '';
    let bestCount = 0;
    for (const [key, count] of Object.entries(votes)) {
      if (count > bestCount) {
        bestKey = key;
        bestCount = count;
      }
    }

    return {
      output: representative[bestKey] ?? '',
      strategy: this.name,
      // Frazione di agenti d'accordo sulla risposta vincente: una misura
      // diretta del consenso interno allo swarm.
      confidence: ok.length > 0 ? bestCount / ok.length : 0,
      votes,
    };
  }
}

/* -------------------------------------------------------------------------- */

export interface LLMJudgeOptions {
  /** Modello giudice: conviene piu' forte dei worker, es. "claude-opus-4-8". */
  model: string;
  /** Se true, il giudice SINTETIZZA una risposta nuova; se false, ne SCEGLIE una. */
  synthesize?: boolean;
  maxTokens?: number;
}

export class LLMJudgeAggregator implements Aggregator {
  readonly name = 'llm_judge';

  constructor(
    private readonly provider: LLMProvider,
    private readonly options: LLMJudgeOptions,
  ) {}

  async aggregate(task: string, results: AgentResult[]): Promise<AggregationResult> {
    const ok = results.filter((r) => r.success && r.output.trim());

    if (ok.length === 0) {
      return { output: '', strategy: this.name, confidence: 0, rationale: 'Nessun candidato valido.' };
    }
    if (ok.length === 1) {
      const only = ok[0] as AgentResult;
      return {
        output: only.output,
        strategy: this.name,
        confidence: 0.5,
        rationale: 'Un solo candidato disponibile, nessun confronto possibile.',
      };
    }

    const candidates = ok
      .map((r, i) => `<candidato id="${i + 1}">\n${r.output}\n</candidato>`)
      .join('\n\n');

    const mode = this.options.synthesize
      ? 'Sintetizza la risposta finale migliore combinando gli elementi corretti dei vari candidati.'
      : 'Scegli il candidato migliore e riportane il contenuto come risposta finale.';

    const prompt = [
      'Sei un giudice esperto e imparziale.',
      '',
      'Task originale:',
      `<task>\n${task}\n</task>`,
      '',
      'Risposte prodotte da agenti indipendenti:',
      '',
      candidates,
      '',
      mode,
      '',
      'Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo',
      'e senza blocchi di codice markdown, in questo formato esatto:',
      '{"answer": "<risposta finale>", "winner": <id numerico oppure null>, "confidence": <numero tra 0 e 1>, "rationale": "<breve motivazione>"}',
    ].join('\n');

    const response = await this.provider.chat({
      model: this.options.model,
      max_tokens: this.options.maxTokens ?? 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const parsed = safeParseJSON(text);

    return {
      output: typeof parsed?.answer === 'string' ? parsed.answer : text.trim(),
      strategy: this.name,
      confidence: clamp01(Number(parsed?.confidence ?? 0.6)),
      rationale: typeof parsed?.rationale === 'string' ? parsed.rationale : undefined,
    };
  }
}

/**
 * Parser JSON tollerante: rimuove eventuali fence ```json ... ``` e isola il
 * primo oggetto { ... } presente nel testo. I modelli a volte aggiungono
 * preamboli nonostante le istruzioni, quindi non ci si fida del parse diretto.
 */
function safeParseJSON(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
