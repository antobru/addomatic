/**
 * examples/run-swarm-ollama.ts
 * ----------------------------
 * Demo end-to-end con Ollama (modelli locali, nessuna API key).
 *
 * Prerequisiti:
 *   1. Installare Ollama: https://ollama.com
 *   2. Scaricare un modello con tool calling:
 *        ollama pull llama3.1
 *      oppure: qwen2.5, mistral-nemo, phi4, ecc.
 *   3. Assicurarsi che Ollama sia in esecuzione (di default su :11434)
 *
 * Esecuzione:
 *   npm run example:ollama
 *   # oppure con un modello diverso:
 *   OLLAMA_MODEL=qwen2.5 npm run example:ollama
 *
 * Note sui modelli:
 *   - llama3.1 / llama3.2: buon equilibrio velocita'/qualita'
 *   - qwen2.5 / qwen2.5-coder: ottimo per ragionamento e tool use
 *   - mistral-nemo: leggero, rapido
 *   - phi4: Microsoft, buono su ragionamento matematico
 */
import {
  OllamaProvider,
  Swarm,
  MajorityVoteAggregator,
  LLMJudgeAggregator,
  extractAfterMarker,
  calculatorTool,
  type SwarmResult,
} from '../src/index.js';

const OLLAMA_MODEL = process.env['OLLAMA_MODEL'] ?? 'llama3.1';
const OLLAMA_URL = process.env['OLLAMA_URL'] ?? 'http://localhost:11434/v1';

console.log(`Provider: Ollama  |  Modello: ${OLLAMA_MODEL}  |  URL: ${OLLAMA_URL}`);

const provider = new OllamaProvider(OLLAMA_URL);

function report(title: string, result: SwarmResult): void {
  console.log(`\n=== ${title} ===`);
  console.log(`Task: ${result.task}`);
  console.log(`\nRisposta finale (${result.final.strategy}):`);
  console.log(`  ${result.final.output}`);
  console.log(`  confidenza: ${(result.final.confidence * 100).toFixed(0)}%`);
  if (result.final.rationale) console.log(`  motivazione del giudice: ${result.final.rationale}`);
  if (result.final.votes) {
    console.log('  voti:');
    for (const [answer, count] of Object.entries(result.final.votes)) {
      console.log(`    "${answer}" -> ${count}`);
    }
  }
  console.log('\nDettaglio agenti:');
  for (const c of result.candidates) {
    const status = c.success ? 'OK ' : 'ERR';
    const snippet = (c.success ? c.output : c.error ?? '').replace(/\s+/g, ' ').slice(0, 80);
    console.log(`  [${status}] ${c.agentId} (${c.iterations} iter, ${c.durationMs}ms): ${snippet}`);
  }
  const { stats } = result;
  console.log(
    `\nStat: ${stats.succeeded}/${stats.total} ok | ` +
      `${stats.totalInputTokens} tok in / ${stats.totalOutputTokens} tok out | ` +
      `tempo reale ${stats.wallClockMs}ms`,
  );
}

/* SCENARIO 1 -----------------------------------------------------------------
 * Task matematico con tool use. Il voto di maggioranza filtra gli errori.
 * I modelli locali più piccoli beneficiano particolarmente dello swarm:
 * la ridondanza compensa l'incertezza del singolo agente.                    */
async function scenarioMajorityVote(): Promise<void> {
  const swarm = new Swarm(provider, {
    size: 3,
    concurrency: 3,
    aggregator: new MajorityVoteAggregator(extractAfterMarker('ANSWER:')),
    agent: {
      model: OLLAMA_MODEL,
      temperature: 0.7,
      maxTokens: 1024,
      tools: [calculatorTool],
      systemPrompt:
        'Risolvi il problema ragionando passo per passo. Usa lo strumento ' +
        'calculator per ogni calcolo aritmetico. Concludi SEMPRE con una riga ' +
        'finale nel formato esatto "ANSWER: <numero>" e nient\'altro dopo.',
    },
  });

  const task =
    'Un negozio vende 240 prodotti al mese con un margine del 35% su un ' +
    'prezzo di acquisto di 12 euro. Qual è il profitto mensile totale in euro?';

  report('Scenario 1 — Voto di maggioranza con tool use (Ollama)', await swarm.run(task));
}

/* SCENARIO 2 -----------------------------------------------------------------
 * Task aperto con giudice LLM. Notare che il giudice può usare un provider
 * diverso dagli agenti worker (es. giudice su Claude, worker su Ollama).
 * In questo esempio sia worker che giudice usano Ollama.                     */
async function scenarioLLMJudge(): Promise<void> {
  const swarm = new Swarm(provider, {
    size: 3,
    concurrency: 3,
    aggregator: new LLMJudgeAggregator(provider, {
      model: OLLAMA_MODEL,
      synthesize: true,
      maxTokens: 512,
    }),
    agent: {
      model: OLLAMA_MODEL,
      temperature: 0.9,
      maxTokens: 256,
      systemPrompt:
        'Sei un copywriter creativo. Proponi UNA singola tagline, breve e ' +
        'memorabile, per il prodotto descritto. Rispondi SOLO con la tagline, ' +
        'senza spiegazioni.',
    },
  });

  const task =
    'Prodotto: un\'app mobile che usa l\'AI per pianificare automaticamente ' +
    'i pasti della settimana in base agli ingredienti che hai in casa. ' +
    'Pubblico target: famiglie italiane 30-50 anni.';

  report('Scenario 2 — Giudice LLM (Ollama su Ollama)', await swarm.run(task));
}

/* SCENARIO 3 — BONUS ---------------------------------------------------------
 * Mostra come combinare provider diversi: worker economici su Ollama,
 * giudice più capace su Anthropic Claude (decommentare se hai ANTHROPIC_API_KEY). */
// async function scenarioCrossProvider(): Promise<void> {
//   import { AnthropicProvider } from '../src/index.js';
//   const judgeProvider = new AnthropicProvider();
//
//   const swarm = new Swarm(provider, {   // worker su Ollama
//     size: 4,
//     concurrency: 4,
//     aggregator: new LLMJudgeAggregator(judgeProvider, {  // giudice su Claude
//       model: 'claude-opus-4-8',
//       synthesize: true,
//     }),
//     agent: { model: OLLAMA_MODEL, temperature: 0.8, maxTokens: 512,
//       systemPrompt: 'Sei un esperto. Rispondi in modo conciso e preciso.' },
//   });
//   const task = 'Quali sono i tre principali vantaggi dell\'uso di modelli LLM locali?';
//   report('Scenario 3 — Cross-provider (Ollama workers + Claude judge)', await swarm.run(task));
// }

async function main(): Promise<void> {
  await scenarioMajorityVote();
  await scenarioLLMJudge();
}

main().catch((e) => {
  console.error('\nErrore fatale:', e instanceof Error ? e.message : String(e));
  console.error('\nAssicurati che Ollama sia in esecuzione e che il modello sia scaricato:');
  console.error(`  ollama pull ${OLLAMA_MODEL}`);
  process.exit(1);
});
