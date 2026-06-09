/**
 * pipeline.ts
 * -----------
 * Orchestratore sequenziale. Ogni stage riceve l'output del precedente
 * attraverso PipelineContext e può costruire il proprio task dinamicamente.
 *
 * I quattro tipi di stage:
 *  - swarm:     fan-out su N agenti + aggregazione (massima robustezza)
 *  - agent:     singolo agente (più economico per step semplici)
 *  - transform: funzione TypeScript pura, zero API call (formattazione, routing)
 *  - action:    codice arbitrario con side-effect (chiamate API, I/O, DB)
 *
 * La pipeline istanzia Swarm/Agent internamente per ogni stage: l'utente
 * specifica solo la configurazione, non gestisce il ciclo di vita degli oggetti.
 */
import type { LLMProvider } from './providers/types.js';
import { Swarm } from './swarm.js';
import { Agent } from './agent.js';
import type {
  PipelineConfig,
  PipelineContext,
  PipelineProgressEvent,
  PipelineResult,
  PipelineStats,
  StageConfig,
  StageResult,
  SwarmStageConfig,
  AgentStageConfig,
  TransformStageConfig,
  ActionStageConfig,
  SwarmProgressEvent,
} from '../types.js';

export class Pipeline {
  constructor(
    private readonly provider: LLMProvider,
    private readonly config: PipelineConfig,
  ) {}

  async run(task: string): Promise<PipelineResult> {
    const { stages, stopOnFailure = true, onProgress } = this.config;
    const pipelineStart = Date.now();

    onProgress?.({ type: 'pipeline_start', totalStages: stages.length, task });

    const results: StageResult[] = [];
    const ctx: PipelineContext = { originalTask: task, stages: {}, previous: null };

    for (let i = 0; i < stages.length; i++) {
      const stageConfig = stages[i]!;
      const stageTask = this.resolveTask(stageConfig, ctx, task);

      onProgress?.({
        type: 'stage_start',
        stageName: stageConfig.name,
        stageType: stageConfig.type,
        stageIndex: i,
        task: stageTask,
      });

      const stageStart = Date.now();
      let result: StageResult;

      try {
        result = await this.runStage(stageConfig, stageTask, ctx, onProgress);
      } catch (e) {
        const error = (e as Error).message;
        result = {
          stageName: stageConfig.name,
          task: stageTask,
          output: '',
          success: false,
          error,
          durationMs: Date.now() - stageStart,
        };
        onProgress?.({ type: 'pipeline_error', stageName: stageConfig.name, error });
        onProgress?.({
          type: 'stage_done',
          stageName: stageConfig.name,
          stageIndex: i,
          success: false,
          durationMs: result.durationMs,
          error,
        });
        if (stopOnFailure) {
          throw new Error(`Pipeline interrotta allo stage "${stageConfig.name}": ${error}`);
        }
      }

      results.push(result!);
      ctx.stages[stageConfig.name] = result!;
      ctx.previous = result!;

      onProgress?.({
        type: 'stage_done',
        stageName: stageConfig.name,
        stageIndex: i,
        success: result!.success,
        durationMs: result!.durationMs,
        output: result!.success ? result!.output : undefined,
        error: result!.error,
      });
    }

    const succeededStages = results.filter((r) => r.success).length;
    const totalDurationMs = Date.now() - pipelineStart;

    onProgress?.({ type: 'pipeline_done', totalStages: stages.length, succeededStages, totalDurationMs });

    const stats: PipelineStats = {
      totalStages: stages.length,
      succeededStages,
      failedStages: stages.length - succeededStages,
      totalDurationMs,
    };

    return {
      task,
      stages: results,
      final: [...results].reverse().find((r) => r.success) ?? null,
      stats,
    };
  }

  // ── Risoluzione task ──────────────────────────────────────────────────────

  private resolveTask(stage: StageConfig, ctx: PipelineContext, fallback: string): string {
    if (stage.type === 'transform') {
      // TransformStage non ha campo task: il context è il suo "input"
      return ctx.previous?.output ?? fallback;
    }
    const resolver = stage.task;
    if (!resolver) return ctx.previous?.output ?? fallback;
    return typeof resolver === 'function' ? resolver(ctx) : resolver;
  }

  // ── Esecuzione per tipo di stage ──────────────────────────────────────────

  private async runStage(
    stage: StageConfig,
    task: string,
    ctx: PipelineContext,
    onProgress: ((event: PipelineProgressEvent) => void) | undefined,
  ): Promise<StageResult> {
    const start = Date.now();

    // Wrapper che promuove SwarmProgressEvent → stage_event della pipeline
    const wrap = (event: SwarmProgressEvent): void => {
      onProgress?.({ type: 'stage_event', stageName: stage.name, event });
    };

    switch (stage.type) {
      case 'swarm': return this.runSwarmStage(stage, task, start, wrap);
      case 'agent': return this.runAgentStage(stage, task, start, wrap);
      case 'transform': return this.runTransformStage(stage, ctx, start);
      case 'action': return this.runActionStage(stage, task, ctx, start);
    }
  }

  private async runSwarmStage(
    stage: SwarmStageConfig,
    task: string,
    start: number,
    wrap: (event: SwarmProgressEvent) => void,
  ): Promise<StageResult> {
    // Cast necessario: lo spread di Omit<SwarmConfig, 'onProgress'> perde la
    // narrowing della discriminated union. L'invariante è garantita a runtime
    // dalla definizione di SwarmStageConfig (swarmConfig è già un SwarmConfig valido).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const swarm = new Swarm(this.provider, { ...stage.swarmConfig, onProgress: wrap } as any);
    const swarmResult = await swarm.run(task);
    return {
      stageName: stage.name,
      task,
      output: swarmResult.final.output,
      success: true,
      swarmResult,
      durationMs: Date.now() - start,
    };
  }

  private async runAgentStage(
    stage: AgentStageConfig,
    task: string,
    start: number,
    wrap: (event: SwarmProgressEvent) => void,
  ): Promise<StageResult> {
    const agent = new Agent(this.provider, stage.agentConfig);
    const agentResult = await agent.run(stage.agentId ?? stage.name, task, wrap);
    return {
      stageName: stage.name,
      task,
      output: agentResult.output,
      success: agentResult.success,
      error: agentResult.error,
      agentResult,
      durationMs: Date.now() - start,
    };
  }

  private async runTransformStage(
    stage: TransformStageConfig,
    ctx: PipelineContext,
    start: number,
  ): Promise<StageResult> {
    const output = await stage.transform(ctx);
    return {
      stageName: stage.name,
      task: '(transform)',
      output,
      success: true,
      durationMs: Date.now() - start,
    };
  }

  private async runActionStage(
    stage: ActionStageConfig,
    task: string,
    ctx: PipelineContext,
    start: number,
  ): Promise<StageResult> {
    try {
      const executePromise = Promise.resolve(stage.execute(ctx, task));
      const output = stage.timeout
        ? await Promise.race([
            executePromise,
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Action "${stage.name}" timeout after ${stage.timeout}ms`)),
                stage.timeout,
              )
            ),
          ])
        : await executePromise;
      return { stageName: stage.name, task, output, success: true, durationMs: Date.now() - start };
    } catch (err) {
      return {
        stageName: stage.name,
        task,
        output: '',
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  }
}
