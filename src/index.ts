/**
 * index.ts
 * --------
 * API pubblica della libreria. Import tipico:
 *
 *   import { Swarm, AnthropicProvider, MajorityVoteAggregator } from 'swarm-agents';
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

// Provider LLM — scegli quello adatto al tuo stack
export { AnthropicProvider } from './providers/anthropic.js';
export { OpenAICompatibleProvider } from './providers/openai-compat.js';
export { OllamaProvider } from './providers/ollama.js';
export type { OpenAICompatibleOptions } from './providers/openai-compat.js';
export type {
  LLMProvider,
  LLMChatParams,
  LLMChatResponse,
  LLMMessage,
  LLMTextBlock,
  LLMToolUseBlock,
  LLMToolResultBlock,
  LLMTool,
} from './providers/types.js';

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
