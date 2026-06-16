import type { PipelineResult } from '@addomatic/core';
import type { PlaneToolsConfig } from '../../agent-tools/plane/plane-tools.js';

export interface PmAiToolEvent {
  stage: 'plane-setup' | 'plane-report';
  tool: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
  durationMs: number;
}

export interface PmAiServiceOptions {
  verbose?: boolean;
  plane?: PlaneToolsConfig;
  onToolEvent?: (event: PmAiToolEvent) => void;
}

export interface PmAiResult {
  pipeline: PipelineResult;
  planeProjectId?: string;
}
