/**
 * swarm.ts
 * --------
 * L'orchestratore. A differenza del pattern "supervisore" (un LLM che assegna
 * sotto-task a ruoli diversi), lo swarm e' OMOGENEO: lancia N copie dello
 * stesso agente sullo stesso task e poi delega all'aggregatore la scelta della
 * risposta finale. La ridondanza compra robustezza:
 *
 *  - errori casuali di un singolo agente vengono "votati fuori";
 *  - su task incerti, il consenso tra agenti indipendenti e' un segnale di
 *    affidabilita' (alta concordanza -> alta confidenza).
 */
import type { LLMProvider } from './providers/types.js';
import { Agent } from './agent.js';
import { mapWithConcurrency } from './concurrency.js';
import type { SwarmConfig, SwarmResult } from '../types.js';

export class Swarm {
  private readonly agent: Agent;

  constructor(
    provider: LLMProvider,
    private readonly config: SwarmConfig,
  ) {
    // Una sola istanza Agent, riusata da tutti i worker: vedi nota in agent.ts.
    this.agent = new Agent(provider, config.agent);
  }

  async run(task: string): Promise<SwarmResult> {
    const wallStart = Date.now();
    const concurrency = this.config.concurrency ?? this.config.size;
    const ids = Array.from({ length: this.config.size }, (_, i) => `agent-${i + 1}`);

    // Fan-out: tutti i worker partono sullo stesso task, a concorrenza limitata.
    const candidates = await mapWithConcurrency(ids, concurrency, (id) =>
      this.agent.run(id, task),
    );

    const succeeded = candidates.filter((c) => c.success);

    // Soglia minima di successi: se troppi agenti falliscono, meglio fermarsi
    // che aggregare su dati troppo pochi e poco affidabili.
    if (this.config.minSuccesses && succeeded.length < this.config.minSuccesses) {
      throw new Error(
        `Solo ${succeeded.length}/${this.config.size} agenti hanno avuto successo ` +
          `(minimo richiesto: ${this.config.minSuccesses}).`,
      );
    }

    // Fan-in: l'aggregatore riduce i candidati a una risposta sola.
    const final = await this.config.aggregator.aggregate(task, candidates);

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
        wallClockMs: Date.now() - wallStart,
      },
    };
  }
}
