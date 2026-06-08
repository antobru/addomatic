/**
 * swarm.ts
 * --------
 * L'orchestratore. Supporta due modalità:
 *
 *  - **Omogenea**: N copie identiche dello stesso agente (`size` + `agent`).
 *    Tutte le istanze condividono lo stesso modello, provider e configurazione.
 *    La ridondanza compra robustezza: errori casuali vengono "votati fuori".
 *
 *  - **Eterogenea**: ogni worker ha il proprio `AgentConfig` e, opzionalmente,
 *    il proprio `LLMProvider` (`workers: AgentWorkerConfig[]`).
 *    Permette di mescolare modelli forti/veloci, system prompt diversi
 *    ("critico" vs "creativo"), o provider diversi (Anthropic + Ollama).
 *
 * In entrambi i casi il fan-in viene delegato all'aggregatore.
 */
import type { LLMProvider } from './providers/types.js';
import { Agent } from './agent.js';
import { mapWithConcurrency } from './concurrency.js';
import type { SwarmConfig, SwarmResult } from '../types.js';

interface ResolvedWorker {
  id: string;
  agent: Agent;
}

export class Swarm {
  private readonly workers: ResolvedWorker[];

  constructor(
    provider: LLMProvider,
    private readonly config: SwarmConfig,
  ) {
    if ('workers' in config && config.workers) {
      // Modalità eterogenea: un Agent per worker, con provider opzionale per ognuno.
      this.workers = config.workers.map((w, i) => ({
        id: w.id ?? `agent-${i + 1}`,
        agent: new Agent(w.provider ?? provider, w.agent),
      }));
    } else {
      // Modalità omogenea: N istanze identiche.
      // Agent è stateless → riusare la stessa istanza sarebbe uguale, ma creare
      // N istanze distinte rende il codice simmetrico con il caso eterogeneo.
      this.workers = Array.from({ length: config.size }, (_, i) => ({
        id: `agent-${i + 1}`,
        agent: new Agent(provider, config.agent),
      }));
    }
  }

  async run(task: string): Promise<SwarmResult> {
    const { onProgress } = this.config;
    const wallStart = Date.now();
    const size = this.workers.length;
    const concurrency = this.config.concurrency ?? size;

    onProgress?.({ type: 'swarm_start', task, size, concurrency });

    // Fan-out: tutti i worker partono sullo stesso task, a concorrenza limitata.
    const candidates = await mapWithConcurrency(this.workers, concurrency, async ({ id, agent }) => {
      onProgress?.({ type: 'agent_start', agentId: id });
      const result = await agent.run(id, task, onProgress);
      onProgress?.({
        type: 'agent_done',
        agentId: id,
        success: result.success,
        durationMs: result.durationMs,
        iterations: result.iterations,
        output: result.success ? result.output : undefined,
        error: result.error,
      });
      return result;
    });

    const succeeded = candidates.filter((c) => c.success);

    // Soglia minima di successi: se troppi agenti falliscono, meglio fermarsi
    // che aggregare su dati troppo pochi e poco affidabili.
    if (this.config.minSuccesses && succeeded.length < this.config.minSuccesses) {
      throw new Error(
        `Solo ${succeeded.length}/${size} agenti hanno avuto successo ` +
          `(minimo richiesto: ${this.config.minSuccesses}).`,
      );
    }

    // Fan-in: l'aggregatore riduce i candidati a una risposta sola.
    onProgress?.({ type: 'aggregating', strategy: this.config.aggregator.name, candidateCount: succeeded.length });
    const final = await this.config.aggregator.aggregate(task, candidates);

    const wallClockMs = Date.now() - wallStart;
    onProgress?.({ type: 'swarm_done', succeeded: succeeded.length, total: candidates.length, wallClockMs });

    return {
      task,
      final,
      candidates,
      stats: {
        total: candidates.length,
        succeeded: succeeded.length,
        failed: candidates.length - succeeded.length,
        totalInputTokens: candidates.reduce((s, c) => s + c.inputTokens, 0),
        totalOutputTokens: candidates.reduce((s, c) => s + c.outputTokens, 0),
        wallClockMs,
      },
    };
  }
}
