import type { PipelineResult } from '@addomatic/core';

export type DevAiAuth =
  | { type: 'pat'; token: string }
  | { type: 'ssh'; keyPath: string };

export interface DevAiTask {
  title: string;
  description: string;
  acceptanceCriteria?: string[];
  /** Hint: files to focus on during analysis and implementation. */
  targetFiles?: string[];
  /** Labels to apply to the pull request. */
  labels?: string[];

  repo: {
    url: string;
    baseBranch?: string;
    auth: DevAiAuth;
    platform: 'github' | 'gitlab' | 'bitbucket';
    /** Token for PR creation API (may differ from clone PAT). */
    apiToken?: string;
    /** For self-hosted GitLab instances. */
    apiBaseUrl?: string;
  };

  verification?: {
    /** Runs once with network enabled (e.g. "npm ci"). */
    installCommand?: string;
    /** Run without network after each implementation attempt. */
    commands: string[];
    /** Max implementation+verification retry cycles. Default: 3. */
    maxRetries?: number;
  };
}

export interface DevAiToolEvent {
  stage: string;
  tool: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
  durationMs: number;
}

export interface DevAiServiceOptions {
  verbose?: boolean;
  /** Where to place temp workspaces. Default: os.tmpdir(). */
  workspaceRoot?: string;
  onToolEvent?: (event: DevAiToolEvent) => void;
  /** Max implementation+verification cycles. Default: 3. */
  maxImplementationRetries?: number;
  /** Number of parallel reviewer agents. Default: 3. */
  reviewerCount?: number;
  docker?: {
    /** Container memory limit. Default: "2g". */
    memory?: string;
    /** Container CPU limit. Default: "2.0". */
    cpus?: string;
  };
}

export interface DevAiResult {
  pipeline: PipelineResult;
  prUrl?: string;
  commitHash?: string;
  branchName?: string;
  isDraft?: boolean;
  reviewReport?: string;
  implementationAttempts?: number;
}

export interface LanguageProfile {
  language: string;
  dockerImage: string;
}
