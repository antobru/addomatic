/**
 * index.ts
 * --------
 * API pubblica della libreria. Import tipico:
 *
 *   import { Swarm, MajorityVoteAggregator } from 'swarm-agents';
 */
export { Agent } from './agent.js';
export { Swarm } from './swarm.js';
export {
  MajorityVoteAggregator,
  LLMJudgeAggregator,
  defaultNormalize,
  extractAfterMarker,
} from './aggregators.js';
export type { LLMJudgeOptions } from './aggregators.js';
export { mapWithConcurrency } from './concurrency.js';
export { calculatorTool } from './tools.js';
export type {
  AgentTool,
  JSONSchema,
  AgentConfig,
  AgentResult,
  TraceStep,
  TraceStepType,
  Aggregator,
  AggregationResult,
  SwarmConfig,
  SwarmResult,
  SwarmStats,
} from '../types.js';
