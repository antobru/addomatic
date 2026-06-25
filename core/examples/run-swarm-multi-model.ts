/**
 * examples/run-swarm-multi-model.ts
 * ----------------------------------
 * Demo di swarm **eterogeneo**: ogni worker ha il suo modello, system prompt
 * e temperatura. Mostra due scenari:
 *
 *  1. **Opus + Haiku×2** — stesso provider Anthropic, modelli diversi.
 *     Opus lavora con bassa temperatura (preciso), i due Haiku con alta
 *     temperatura (creativi/diversi). Il giudice Opus sintetizza il meglio.
 *
 *  2. **Cross-provider** — un worker Claude (cloud) + un worker Ollama (locale).
 *     Richiede Ollama in esecuzione su :11434 con llama3.1 installato.
 *     Se Ollama non è disponibile lo scenario viene saltato con un avviso.
 *
 * Esecuzione:
 *   npm run example:multi-model
 *
 * Variabili d'ambiente:
 *   ANTHROPIC_API_KEY — obbligatoria (default: da .env)
 *   OLLAMA_MODEL      — modello Ollama per scenario 2 (default: llama3.1)
 *   OLLAMA_URL        — URL base Ollama (default: http://localhost:11434/v1)
 */
import {
  AnthropicProvider,
  ollamaProvider,
  Swarm,
  LLMJudgeAggregator,
  MajorityVoteAggregator,
  extractAfterMarker,
  consoleSwarmLogger,
  type SwarmResult,
} from '../src/index.js';

const OLLAMA_MODEL = process.env['OLLAMA_MODEL'] ?? 'llama3.1';
const OLLAMA_URL   = process.env['OLLAMA_URL']   ?? 'http://localhost:11434/v1';

const anthropic = new AnthropicProvider();

// ── Utility di stampa ──────────────────────────────────────────────────────────

function report(title: string, result: SwarmResult): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${title}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`Task: ${result.task}\n`);
  console.log(`Risposta finale  [${result.final.strategy}]  confidenza ${(result.final.confidence * 100).toFixed(0)}%`);
  console.log(`  ${result.final.output}`);
  if (result.final.rationale)
    console.log(`\nRazionale giudice: ${result.final.rationale}`);
  console.log('\nDettaglio worker:');
  for (const c of result.candidates) {
    const icon   = c.success ? '✓' : '✗';
    const dur    = (c.durationMs / 1000).toFixed(1);
    const snip   = (c.success ? c.output : c.error ?? '').replace(/\s+/g, ' ').slice(0, 90);
    console.log(`  ${icon}  ${c.agentId}  (${c.model})  ${dur}s  ${c.iterations} iter`);
    console.log(`     └ ${snip}`);
  }
  const { stats } = result;
  console.log(
    `\nStat: ${stats.succeeded}/${stats.total} ok  |  ` +
    `${stats.totalInputTokens} tok in / ${stats.totalOutputTokens} tok out  |  ` +
    `${(stats.wallClockMs / 1000).toFixed(1)}s reale`,
  );
}

// ── Scenario 1: Opus + Haiku×2 ────────────────────────────────────────────────

async function scenarioOpusHaiku(): Promise<void> {
  console.log('\n[Scenario 1] Swarm eterogeneo: Opus careful + Haiku×2 creative\n');

  const swarm = new Swarm(anthropic, {
    workers: [
      {
        id: 'opus-careful',
        agent: {
          model: 'claude-opus-4-8',
          temperature: 0.2,
          maxTokens: 1024,
          systemPrompt:
            'Sei un analista metodico. Ragiona passo per passo, sii preciso ' +
            'e cita sempre i dati su cui ti basi. Concludi con un punto chiave ' +
            'sintetico nel formato "RISPOSTA: <testo>".',
        },
      },
      {
        id: 'haiku-creative-1',
        agent: {
          model: 'claude-haiku-4-5',
          temperature: 0.95,
          maxTokens: 512,
          systemPrompt:
            'Sei un esperto creativo. Proponi prospettive non ovvie, porta ' +
            'esempi concreti e vai dritto al punto. Concludi con ' +
            '"RISPOSTA: <testo>".',
        },
      },
      {
        id: 'haiku-creative-2',
        agent: {
          model: 'claude-haiku-4-5',
          temperature: 0.95,
          maxTokens: 512,
          systemPrompt:
            'Sei un critico costruttivo. Individua i rischi e le obiezioni ' +
            'principali, poi suggerisci come superarli. Concludi con ' +
            '"RISPOSTA: <testo>".',
        },
      },
    ],
    concurrency: 3,
    onProgress: consoleSwarmLogger({ verbose: false }),
    aggregator: new LLMJudgeAggregator(anthropic, {
      model: 'claude-opus-4-8',
      synthesize: true,
      maxTokens: 512,
    }),
  });

  const task =
    'Quali sono le tre strategie più efficaci per ridurre il time-to-market ' +
    'di un prodotto software B2B senza sacrificare la qualità?';

  report('Scenario 1 — Opus careful + Haiku×2 creative + giudice Opus', await swarm.run(task));
}

// ── Scenario 2: cross-provider (Anthropic + Ollama) ───────────────────────────

async function scenarioCrossProvider(): Promise<void> {
  console.log('\n[Scenario 2] Swarm cross-provider: Claude + Ollama locale\n');

  // Verifica rapida che Ollama risponda prima di avviare il scenario.
  const ollama = ollamaProvider(OLLAMA_URL);
  try {
    await ollama.chat({
      model: OLLAMA_MODEL,
      system: 'rispondi ok',
      messages: [{ role: 'user', content: 'ok?' }],
      tools: [],
      max_tokens: 16,
      temperature: 0,
    });
  } catch {
    console.warn(`\n[Scenario 2] Ollama non raggiungibile su ${OLLAMA_URL} — scenario saltato.`);
    console.warn(`  Avvia Ollama e scarica il modello con:  ollama pull ${OLLAMA_MODEL}\n`);
    return;
  }

  const swarm = new Swarm(anthropic, {
    workers: [
      {
        id: 'claude-haiku',
        agent: {
          model: 'claude-haiku-4-5',
          temperature: 0.7,
          maxTokens: 512,
          systemPrompt:
            'Sei un consulente di marketing. Dai una risposta concisa e ' +
            'orientata ai dati. Inizia con "RISPOSTA:".',
        },
        // provider non specificato → usa il default (AnthropicProvider)
      },
      {
        id: 'ollama-local',
        agent: {
          model: OLLAMA_MODEL,
          temperature: 0.8,
          maxTokens: 512,
          systemPrompt:
            'Sei un esperto di business. Rispondi in modo pratico con esempi ' +
            'reali. Inizia con "RISPOSTA:".',
        },
        provider: ollama, // provider override: questo worker usa Ollama
      },
    ],
    concurrency: 2,
    onProgress: consoleSwarmLogger({ verbose: false }),
    aggregator: new MajorityVoteAggregator(extractAfterMarker('RISPOSTA:')),
  });

  const task =
    'Qual è il canale di acquisizione clienti più efficace per una startup ' +
    'SaaS B2B nel settore manifatturiero italiano?';

  report(
    `Scenario 2 — Cross-provider: claude-haiku + ollama (${OLLAMA_MODEL})`,
    await swarm.run(task),
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await scenarioOpusHaiku();
  await scenarioCrossProvider();
}

main().catch((e) => {
  console.error('\nErrore fatale:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
