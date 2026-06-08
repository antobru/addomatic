/**
 * examples/run-swarm.ts
 * ---------------------
 * Demo end-to-end con Anthropic Claude. Due scenari che mostrano quando usare
 * quale aggregatore.
 *
 * Esecuzione:
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   npm run example
 *
 * (oppure, con Node >= 20, mettere la chiave in .env e usare:
 *   node --env-file=.env --import tsx examples/run-swarm.ts)
 */
import {
  AnthropicProvider,
  Swarm,
  MajorityVoteAggregator,
  LLMJudgeAggregator,
  extractAfterMarker,
  calculatorTool,
  type SwarmResult,
} from '../src/index.js';

// AnthropicProvider legge ANTHROPIC_API_KEY dall'ambiente.
const provider = new AnthropicProvider();

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
    const snippet = (c.success ? c.output : c.error ?? '').replace(/\s+/g, ' ').slice(0, 70);
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
 * Problema con UNA risposta corretta verificabile. La temperatura alta crea
 * percorsi di ragionamento diversi; il voto di maggioranza scarta gli errori. */
async function scenarioMajorityVote(): Promise<void> {
  const swarm = new Swarm(provider, {
    size: 5,
    concurrency: 5,
    aggregator: new MajorityVoteAggregator(extractAfterMarker('ANSWER:')),
    agent: {
      model: 'claude-haiku-4-5',
      temperature: 1,
      maxTokens: 1024,
      tools: [calculatorTool],
      systemPrompt:
        'Risolvi il problema ragionando passo per passo. Usa lo strumento ' +
        'calculator per ogni calcolo. Concludi SEMPRE con una riga finale nel ' +
        'formato esatto "ANSWER: <numero>" e nient\'altro dopo.',
    },
  });

  const task =
    'Un treno percorre 360 km in 4 ore. Un secondo treno, sulla stessa tratta, ' +
    'e\' del 25% piu\' veloce. Quanti minuti impiega il secondo treno a percorrere la tratta?';

  report('Scenario 1 — Voto di maggioranza (task verificabile)', await swarm.run(task));
}

/* SCENARIO 2 -----------------------------------------------------------------
 * Task aperto, senza risposta unica. Il voto non servirebbe (ogni agente
 * produce un testo diverso): un giudice LLM valuta la qualita' e sintetizza. */
async function scenarioLLMJudge(): Promise<void> {
  const swarm = new Swarm(provider, {
    size: 4,
    concurrency: 4,
    aggregator: new LLMJudgeAggregator(provider, { model: 'claude-opus-4-8', synthesize: true }),
    agent: {
      model: 'claude-haiku-4-5',
      temperature: 1,
      maxTokens: 512,
      systemPrompt:
        'Sei un copywriter. Proponi UNA singola tagline, breve e memorabile, ' +
        'per il prodotto descritto. Rispondi solo con la tagline.',
    },
  });

  const task =
    'Prodotto: una borraccia smart che ricorda di bere e tiene traccia ' +
    "dell'idratazione tramite app. Pubblico: professionisti urbani 25-40 anni.";

  report('Scenario 2 — Giudice LLM (task aperto, sintesi)', await swarm.run(task));
}

async function main(): Promise<void> {
  await scenarioMajorityVote();
  await scenarioLLMJudge();
}

main().catch((e) => {
  console.error('Errore fatale:', e);
  process.exit(1);
});
