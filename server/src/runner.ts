/**
 * runner.ts
 * ---------
 * Converte un SerializablePipeline (JSON puro) in un PipelineConfig runtime.
 *
 * Le parti non-serializzabili vengono ricostruite qui:
 *  - template task → funzione (ctx) => string
 *  - AggregatorConfig → istanza MajorityVoteAggregator / LLMJudgeAggregator
 *  - codice stringa (transform/action) → funzione via new Function()
 *  - nomi tool → istanze AgentTool dal registro built-in
 */
import type {
  PipelineConfig,
  StageConfig,
  PipelineContext,
  AgentConfig,
  AgentTool,
  LLMProvider,
} from '@addomatic/core';
import {
  MajorityVoteAggregator,
  LLMJudgeAggregator,
  AnthropicProvider,
  extractAfterMarker,
  calculatorTool,
} from '@addomatic/core';
import { planeMcpTools } from './agent-tools/plane/plane-tools.js';
import type {
  SerializablePipeline,
  SerializableStageConfig,
  AggregatorConfig,
  AgentConfigSerializable,
} from './types.js';

// ── Tool registry ─────────────────────────────────────────────────────────────

function buildPlaneToolsRegistry(): Record<string, AgentTool> {
  const apiKey = process.env['PLANE_API_KEY'];
  const workspaceSlug = process.env['PLANE_WORKSPACE_SLUG'];
  if (!apiKey || !workspaceSlug) return {};
  const tools = planeMcpTools({
    workspaceSlug,
    apiKey,
    baseUrl: process.env['PLANE_BASE_URL'],
    defaultOwnedBy: process.env['PLANE_OWNED_BY'],
  });
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}

const TOOL_REGISTRY: Record<string, AgentTool> = {
  calculator: calculatorTool,
  ...buildPlaneToolsRegistry(),
};

function resolveTools(names: string[] = []): AgentTool[] {
  return names.map((n) => TOOL_REGISTRY[n]).filter((t): t is AgentTool => !!t);
}

// ── Task template resolution ──────────────────────────────────────────────────

function resolveTemplate(template: string, ctx: PipelineContext): string {
  return template
    .replace(/\{original\}/g, ctx.originalTask)
    .replace(/\{previous\}/g, ctx.previous?.output ?? '')
    .replace(/\{stages\.([^}]+)\}/g, (_, name: string) => ctx.stages[name]?.output ?? '')
    .replace(/\{vars\.([^}]+)\}/g, (_, key: string) => ctx.vars?.[key] ?? '');
}

function makeTaskResolver(task: string | undefined): ((ctx: PipelineContext) => string) | undefined {
  if (!task) return undefined;
  return (ctx: PipelineContext) => resolveTemplate(task, ctx);
}

// ── Aggregator factory ────────────────────────────────────────────────────────

function makeAggregator(config: AggregatorConfig, provider: LLMProvider) {
  if (config.type === 'majority_vote') {
    const normalize = config.extractMarker ? extractAfterMarker(config.extractMarker) : undefined;
    return new MajorityVoteAggregator(normalize);
  }
  // llm_judge: usa lo stesso provider del server (Anthropic) con il modello specificato
  const judgeProvider = provider;
  return new LLMJudgeAggregator(judgeProvider, {
    model: config.model,
    synthesize: config.synthesize,
  });
}

// ── AgentConfig conversion ────────────────────────────────────────────────────

function toAgentConfig(s: AgentConfigSerializable): AgentConfig {
  return {
    model: s.model,
    systemPrompt: s.systemPrompt,
    maxIterations: s.maxIterations ?? 10,
    temperature: s.temperature,
    maxTokens: s.maxTokens,
    tools: resolveTools(s.tools),
  };
}

// ── Code execution helper ─────────────────────────────────────────────────────

function makeTransformFn(code: string): (ctx: PipelineContext) => string | Promise<string> {
  // eslint-disable-next-line no-new-func
  return new Function('ctx', code) as (ctx: PipelineContext) => string | Promise<string>;
}

function makeActionFn(
  code: string,
): (ctx: PipelineContext, resolvedTask: string) => string | Promise<string> {
  // eslint-disable-next-line no-new-func
  return new Function('ctx', 'resolvedTask', code) as (
    ctx: PipelineContext,
    resolvedTask: string,
  ) => string | Promise<string>;
}

// ── Stage conversion ──────────────────────────────────────────────────────────

function toRuntimeStage(stage: SerializableStageConfig, provider: LLMProvider): StageConfig {
  switch (stage.type) {
    case 'swarm':
      return {
        type: 'swarm',
        name: stage.name,
        task: makeTaskResolver(stage.task),
        swarmConfig: {
          size: stage.size,
          agent: toAgentConfig(stage.agentConfig),
          aggregator: makeAggregator(stage.aggregator, provider),
          concurrency: stage.concurrency ?? stage.size,
          minSuccesses: stage.minSuccesses,
        },
      };

    case 'agent':
      return {
        type: 'agent',
        name: stage.name,
        task: makeTaskResolver(stage.task),
        agentConfig: toAgentConfig(stage.agentConfig),
        agentId: stage.agentId,
      };

    case 'transform':
      return {
        type: 'transform',
        name: stage.name,
        transform: makeTransformFn(stage.code),
      };

    case 'action':
      return {
        type: 'action',
        name: stage.name,
        task: makeTaskResolver(stage.task),
        execute: makeActionFn(stage.code),
        timeout: stage.timeout,
      };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildPipelineConfig(
  pipeline: SerializablePipeline,
  provider: LLMProvider,
  onProgress?: PipelineConfig['onProgress'],
): PipelineConfig {
  return {
    stages: pipeline.stages.map((s) => toRuntimeStage(s, provider)),
    stopOnFailure: pipeline.stopOnFailure ?? true,
    onProgress,
  };
}

/** Merge: defaults dalla pipeline + override forniti a runtime. */
export function mergeVars(
  pipeline: SerializablePipeline,
  runtimeVars: Record<string, string> = {},
): Record<string, string> {
  const defaults = Object.fromEntries((pipeline.vars ?? []).map((v) => [v.name, v.defaultValue]));
  return { ...defaults, ...runtimeVars };
}

export function createDefaultProvider(): LLMProvider {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var not set');
  return new AnthropicProvider(apiKey);
}
