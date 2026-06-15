/**
 * types.ts (client)
 * -----------------
 * Schema serializzabile delle pipeline — stesso formato del server.
 * Il client non importa mai dalla libreria server/src; lavora solo con questi tipi.
 */

export interface AgentConfigSerializable {
  model: string;
  systemPrompt: string;
  maxIterations?: number;
  temperature?: number;
  maxTokens?: number;
  tools?: string[];
}

export type AggregatorConfig =
  | { type: 'majority_vote'; extractMarker?: string }
  | { type: 'llm_judge'; model: string; synthesize?: boolean };

export interface SerializableSwarmStage {
  type: 'swarm';
  id: string;
  name: string;
  task?: string;
  size: number;
  agentConfig: AgentConfigSerializable;
  aggregator: AggregatorConfig;
  concurrency?: number;
  minSuccesses?: number;
}

export interface SerializableAgentStage {
  type: 'agent';
  id: string;
  name: string;
  task?: string;
  agentConfig: AgentConfigSerializable;
  agentId?: string;
}

export interface SerializableTransformStage {
  type: 'transform';
  id: string;
  name: string;
  /** Corpo funzione. Firma: (ctx: PipelineContext) => string */
  code: string;
}

export interface SerializableActionStage {
  type: 'action';
  id: string;
  name: string;
  task?: string;
  /** Corpo funzione. Firma: async (ctx, resolvedTask) => string */
  code: string;
  timeout?: number;
}

export type SerializableStageConfig =
  | SerializableSwarmStage
  | SerializableAgentStage
  | SerializableTransformStage
  | SerializableActionStage;

export interface VarDefinition {
  name: string;
  defaultValue: string;
  description?: string;
}

export interface SerializablePipeline {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  stopOnFailure?: boolean;
  stages: SerializableStageConfig[];
  vars?: VarDefinition[];
}

export interface PipelineSummary {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
  stageCount: number;
}

export type StageType = SerializableStageConfig['type'];

export interface RunEvent {
  type: string;
  [key: string]: unknown;
}
