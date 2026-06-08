/**
 * examples/run-swarm-dev.ts
 * -------------------------
 * Demo: swarm di agenti per task di analisi architetturale su una codebase.
 * Gli agenti usano graphify per capire la struttura del codice prima di rispondere.
 *
 * Prerequisiti:
 *   1. ANTHROPIC_API_KEY impostata
 *   2. graphify installato:
 *        pip install graphifyy   oppure   uv tool install graphifyy
 *   3. Knowledge graph costruito nella directory target:
 *        graphify                  # nella root del progetto
 *        # genera graphify-out/GRAPH_REPORT.md + graph.json + graph.html
 *
 * Esecuzione:
 *   npm run example:dev
 *   # oppure su una codebase diversa:
 *   CODEBASE_DIR=/path/to/other/project npm run example:dev
 *
 * Nota: senza graphify installato o il graph costruito, i tool restituiscono
 * messaggi di errore informativi e gli agenti rispondono basandosi sul contesto
 * disponibile. Nessun crash.
 */
import {
  AnthropicProvider,
  Swarm,
  LLMJudgeAggregator,
  graphifyQueryTool,
  graphifyReportTool,
  type SwarmResult,
  OllamaProvider,
} from '../src/index.js';

const CODEBASE_DIR = process.env['CODEBASE_DIR'] ?? '.';

const provider = new OllamaProvider();

console.log(`Codebase analizzata: ${CODEBASE_DIR}`);
console.log(`Provider: ${provider.constructor.name.replace('Provider', '')}\n`);


function report(title: string, result: SwarmResult): void {
  console.log(`\n=== ${title} ===`);
  console.log(`Task: ${result.task}`);
  console.log(`\nRisposta finale (${result.final.strategy}):`);
  console.log(result.final.output);
  console.log(`\n  confidenza: ${(result.final.confidence * 100).toFixed(0)}%`);
  if (result.final.rationale) console.log(`  motivazione giudice: ${result.final.rationale}`);
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

/* SCENARIO — Analisi architetturale con graphify ----------------------------
 * Tre agenti esplorano la codebase in modo indipendente usando i tool graphify.
 * Il giudice (gpt-oss:20b) sintetizza la risposta migliore.             */
async function scenarioArchitectureAnalysis(): Promise<void> {
  const swarm = new Swarm(provider, {
    size: 3,
    concurrency: 3,
    aggregator: new LLMJudgeAggregator(provider, {
      model: 'gpt-oss:20b',
      synthesize: true,
      maxTokens: 1024,
    }),
    agent: {
      model: 'gpt-oss:20b',
      temperature: 0.7,
      maxTokens: 2048,
      tools: [
        graphifyReportTool({ cwd: CODEBASE_DIR }),
        graphifyQueryTool({ cwd: CODEBASE_DIR }),
      ],
      systemPrompt:
        'Sei un software engineer esperto. Per rispondere ai task di sviluppo:\n' +
        '1. Chiama graphify_report per capire la struttura generale della codebase\n' +
        '2. Usa graphify_query per localizzare simboli, classi o moduli specifici\n' +
        '3. Basa la tua analisi SOLO su ciò che hai trovato — non inventare file o simboli.\n' +
        'Sii preciso: cita file e simboli reali trovati nel knowledge graph. ' +
        'Se graphify non è disponibile, rispondi in base al contesto che hai.',
    },
  });

  const task =
    'Come aggiungerei il supporto per lo streaming delle risposte LLM (streaming API) ' +
    'a questo sistema? Quali interfacce e file andrebbero modificati, e in quale ordine?';

  report('Analisi architetturale con graphify (swarm 3 agenti + giudice)', await swarm.run(task));
}

async function main(): Promise<void> {
  await scenarioArchitectureAnalysis();
}

main().catch((e) => {
  console.error('\nErrore fatale:', e instanceof Error ? e.message : String(e));
  console.error('\nAssicurati che:');
  console.error('  1. ANTHROPIC_API_KEY sia impostata');
  console.error('  2. graphify sia installato: pip install graphifyy');
  console.error(`  3. Il knowledge graph sia costruito: cd ${CODEBASE_DIR} && graphify`);
  process.exit(1);
});
