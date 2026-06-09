/**
 * types.ts (server)
 * -----------------
 * Schema serializzabile delle pipeline: JSON puro, nessuna funzione.
 * Questo è il formato salvato su disco e scambiato con il client.
 *
 * I task dinamici usano template string: {original}, {previous}, {stages.NAME}
 * Il codice di transform/action è salvato come stringa (corpo della funzione).
 */

export interface AgentConfigSerializable {
  model: string;
  systemPrompt: string;
  maxIterations?: number;
  temperature?: number;
  maxTokens?: number;
  /** Nomi di tool built-in registrati nel server (es. 'calculator'). */
  tools?: string[];
}

export type AggregatorConfig =
  | { type: 'majority_vote'; extractMarker?: string }
  | { type: 'llm_judge'; model: string; synthesize?: boolean };

export interface SerializableSwarmStage {
  type: 'swarm';
  id: string;
  name: string;
  /** Template: {original}, {previous}, {stages.NAME} — o stringa statica. */
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
  /** Corpo della funzione. Firma implicita: (ctx: PipelineContext) => string */
  code: string;
}

export interface SerializableActionStage {
  type: 'action';
  id: string;
  name: string;
  task?: string;
  /** Corpo della funzione. Firma implicita: async (ctx, resolvedTask) => string */
  code: string;
  timeout?: number;
}

export type SerializableStageConfig =
  | SerializableSwarmStage
  | SerializableAgentStage
  | SerializableTransformStage
  | SerializableActionStage;

export interface SerializablePipeline {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  stopOnFailure?: boolean;
  stages: SerializableStageConfig[];
}

export interface PipelineSummary {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
  stageCount: number;
}
