import type { PipelineResult } from '@addomatic/core';
import type { BoardConfig } from './board/types.js';

export interface PmAiToolEvent {
  stage: 'board-setup' | 'board-report';
  tool: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
  durationMs: number;
}

export interface PmAiServiceOptions {
  verbose?: boolean;
  /** Board su cui creare progetto/issue/report. Se assente, le fasi di board vengono saltate. */
  board?: BoardConfig;
  onToolEvent?: (event: PmAiToolEvent) => void;
}

export interface PmAiResult {
  pipeline: PipelineResult;
  /** ID progetto (Plane) o nome repo (GitHub) creato. */
  projectId?: string;
}

export type { BoardConfig } from './board/types.js';
