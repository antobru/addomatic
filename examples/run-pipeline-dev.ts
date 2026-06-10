/**
 * examples/run-pipeline-dev.ts
 * ----------------------------
 * Demo: pipeline di sviluppo software a 6 stage sequenziali.
 *
 * Workflow:
 *   1. requirements  [agent]     — raccoglie requisiti funzionali (REQ-N)
 *   2. analysis      [swarm×3]   — individua i task tecnici (TASK-N)
 *   3. prioritize    [transform] — ordina i TASK-N, zero costo API
 *   4. develop       [swarm×4]   — progetta l'architettura tecnica
 *   5. validate      [agent]     — verifica copertura requisiti
 *   6. publish       [transform] — assembla documento Markdown finale
 *
 * Esecuzione:
 *   npm run example:pipeline
 *   ANTHROPIC_API_KEY=... tsx examples/run-pipeline-dev.ts
 */
import {
  Pipeline,
  LLMJudgeAggregator,
  consolePipelineLogger,
  type PipelineResult,
  type PipelineContext,
  OllamaProvider,
} from '../src/index.js';

const provider = new OllamaProvider('http://196.168.1.76:11434/v1');

// ── Report finale ─────────────────────────────────────────────────────────────

function report(result: PipelineResult): void {
  console.log('\n' + '═'.repeat(70));
  console.log('RISULTATO PIPELINE');
  console.log('═'.repeat(70));
  console.log(`Task: ${result.task}`);
  console.log(`Stage: ${result.stats.succeededStages}/${result.stats.totalStages} ok`);
  console.log(`Durata totale: ${(result.stats.totalDurationMs / 1000).toFixed(1)}s`);

  console.log('\n── Stage eseguiti ─────────────────────────────────────────────');
  for (const stage of result.stages) {
    const icon = stage.success ? '✓' : '✗';
    const dur  = (stage.durationMs / 1000).toFixed(1);
    console.log(`\n[${icon}] ${stage.stageName}  (${dur}s)`);
    if (stage.success) {
      const snip = stage.output.replace(/\s+/g, ' ').slice(0, 120);
      console.log(`    ${snip}${stage.output.length > 120 ? '…' : ''}`);
    } else {
      console.log(`    ERRORE: ${stage.error}`);
    }
    if (stage.swarmResult) {
      const { stats } = stage.swarmResult;
      console.log(
        `    swarm: ${stats.succeeded}/${stats.total} agenti ok  |  ` +
        `${stats.totalInputTokens} tok in / ${stats.totalOutputTokens} tok out`,
      );
    }
    if (stage.agentResult) {
      const ar = stage.agentResult;
      console.log(`    agent: ${ar.iterations} iter  |  ${ar.inputTokens} tok in / ${ar.outputTokens} tok out`);
    }
  }

  console.log('\n── Documento finale ───────────────────────────────────────────\n');
  console.log(result.final?.output ?? '(nessun output)');
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const pipeline = new Pipeline(provider, {
    stopOnFailure: true,
    onProgress: consolePipelineLogger({ verbose: false }),

    stages: [

      // ─────────────────────────────────────────────────────────────────────
      // Stage 1: Raccolta requisiti — singolo agente, task statico
      // ─────────────────────────────────────────────────────────────────────
      {
        type: 'agent',
        name: 'requirements',
        task: 'Definisci i requisiti funzionali e non funzionali per una REST API ' +
              'di gestione task per team di sviluppo software. ' +
              'Elenca ogni requisito su una riga separata nel formato esatto "REQ-N: <descrizione>". ' +
              'Includi requisiti di autenticazione, gestione permessi, CRUD task, notifiche e performance.',
        agentConfig: {
          model: 'gpt-oss:20b',
          temperature: 0.3,
          maxTokens: 1024,
          systemPrompt:
            'Sei un business analyst esperto in sistemi SaaS B2B. ' +
            'Produci requisiti chiari, misurabili e non ambigui. ' +
            'Usa il formato REQ-N richiesto, una riga per requisito, senza commenti aggiuntivi.',
        },
      },

      // ─────────────────────────────────────────────────────────────────────
      // Stage 2: Analisi e individuazione task — swarm×3 con giudice LLM
      // Il task è costruito dinamicamente dall'output dello stage precedente
      // ─────────────────────────────────────────────────────────────────────
      {
        type: 'swarm',
        name: 'analysis',
        task: (ctx: PipelineContext): string =>
          `Dati questi requisiti:\n\n${ctx.previous!.output}\n\n` +
          'Identifica i task tecnici di implementazione necessari per soddisfarli. ' +
          'Elenca ogni task su una riga nel formato esatto "TASK-N: <descrizione concisa e tecnica>". ' +
          'Includi task per: setup progetto, autenticazione, modelli dati, API endpoints, test, deploy.',
        swarmConfig: {
          size: 3,
          concurrency: 3,
          aggregator: new LLMJudgeAggregator(provider, {
            model: 'gpt-oss:20b',
            synthesize: true,
            maxTokens: 1024,
          }),
          agent: {
            model: 'qwen3-coder:30b',
            temperature: 0.7,
            maxTokens: 1024,
            systemPrompt:
              'Sei un software architect senior. Traduci requisiti business in task tecnici concreti. ' +
              'Sii specifico, evita ridondanze, usa il formato TASK-N richiesto.',
          },
        },
      },

      // ─────────────────────────────────────────────────────────────────────
      // Stage 3: Priorizzazione — transform pura, zero API call
      // Estrae le righe TASK-N, aggiunge indice progressivo
      // ─────────────────────────────────────────────────────────────────────
      {
        type: 'transform',
        name: 'prioritize',
        transform: (ctx: PipelineContext): string => {
          const rawTasks = ctx.previous!.output;
          const taskLines = rawTasks
            .split('\n')
            .filter((line) => /^TASK-\d+:/i.test(line.trim()))
            .map((line, i) => `${i + 1}. ${line.trim()}`);

          if (taskLines.length === 0) {
            // Fallback se il formato non corrisponde: restituisce il testo originale
            return rawTasks;
          }

          return [
            `TASK PRIORITIZZATI (${taskLines.length} totali):`,
            '',
            ...taskLines,
          ].join('\n');
        },
      },

      // ─────────────────────────────────────────────────────────────────────
      // Stage 4: Sviluppo — swarm×4 con concurrency limitata
      // Il task usa sia requirements (stage 1) che prioritize (stage 3)
      // ─────────────────────────────────────────────────────────────────────
      {
        type: 'swarm',
        name: 'develop',
        task: (ctx: PipelineContext): string => {
          const req   = ctx.stages['requirements']?.output ?? '';
          const tasks = ctx.previous!.output;
          return (
            `Requisiti originali:\n${req}\n\n` +
            `Task da implementare:\n${tasks}\n\n` +
            'Progetta l\'architettura tecnica dettagliata per implementare questi task. ' +
            'Per ogni task fornisci: tecnologia scelta, schema dati o endpoint, ' +
            'considerazioni di sicurezza e stima in story point (1/2/3/5/8).'
          );
        },
        swarmConfig: {
          size: 2,
          concurrency: 2,
          aggregator: new LLMJudgeAggregator(provider, {
            model: 'qwen3-coder:30b',
            synthesize: true,
            maxTokens: 2048,
          }),
          agent: {
            model: 'qwen3-coder:30b',
            temperature: 0.5,
            maxTokens: 2048,
            systemPrompt:
              'Sei un senior software engineer specializzato in API REST con Node.js/TypeScript. ' +
              'Progetta architetture solide, sicure e scalabili. ' +
              'Usa standard REST (HTTP verbs, status codes), JWT per auth, ' +
              'PostgreSQL per persistenza, Docker per deploy.',
          },
        },
      },

      // ─────────────────────────────────────────────────────────────────────
      // Stage 5: Validazione — singolo agente critico
      // Confronta i requisiti originali con l'architettura proposta
      // ─────────────────────────────────────────────────────────────────────
      {
        type: 'agent',
        name: 'validate',
        task: (ctx: PipelineContext): string => {
          const req  = ctx.stages['requirements']?.output ?? '';
          const arch = ctx.previous!.output;
          return (
            `Requisiti originali:\n${req}\n\n` +
            `Architettura tecnica proposta:\n${arch}\n\n` +
            'Verifica che ogni requisito sia coperto dall\'architettura. ' +
            'Per ogni gap o rischio identificato, proponi una soluzione concreta. ' +
            'Concludi con una riga nel formato esatto "VERDETTO: APPROVATO" oppure "VERDETTO: RICHIEDE-REVISIONE".'
          );
        },
        agentConfig: {
          model: 'gpt-oss:20b',
          temperature: 0.2,
          maxTokens: 1024,
          systemPrompt:
            'Sei un tech lead con focus su qualità, sicurezza e completezza. ' +
            'Sei critico e rigoroso: identifica ogni gap tra requisiti e implementazione. ' +
            'Sii costruttivo: per ogni problema proponi una soluzione specifica.',
        },
      },

      // ─────────────────────────────────────────────────────────────────────
      // Stage 6: Pubblicazione — transform, zero costo API
      // Assembla tutti gli output in un documento Markdown strutturato
      // ─────────────────────────────────────────────────────────────────────
      {
        type: 'transform',
        name: 'publish',
        transform: (ctx: PipelineContext): string => {
          const requirements = ctx.stages['requirements']?.output ?? '';
          const tasks        = ctx.stages['prioritize']?.output ?? '';
          const architecture = ctx.stages['develop']?.output ?? '';
          const validation   = ctx.stages['validate']?.output ?? '';

          const date = new Date().toISOString().slice(0, 10);
          return [
            '# Technical Design Document',
            '',
            `_Generato automaticamente il ${date} con swarm-agents Pipeline_`,
            '',
            '---',
            '',
            '## 1. Requisiti',
            '',
            requirements,
            '',
            '---',
            '',
            '## 2. Task di Implementazione',
            '',
            tasks,
            '',
            '---',
            '',
            '## 3. Architettura Tecnica',
            '',
            architecture,
            '',
            '---',
            '',
            '## 4. Validazione',
            '',
            validation,
          ].join('\n');
        },
      },
    ],
  });

  const task = 'Sviluppa una REST API di gestione task per team di sviluppo software.';

  try {
    const result = await pipeline.run(task);
    report(result);
  } catch (e) {
    console.error('\nPipeline interrotta:', (e as Error).message);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Errore fatale:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
