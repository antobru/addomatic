import type { PmAiToolEvent } from '../types.js';
import { PlaneBoardProvider } from './plane-provider.js';
import { GithubBoardProvider } from './github-provider.js';
import type { BoardConfig, BoardProvider } from './types.js';

/** Costruisce il board provider giusto dalla config. Estendere qui per nuovi provider. */
export function createBoardProvider(
  config: BoardConfig,
  onToolEvent?: (e: PmAiToolEvent) => void,
): BoardProvider {
  switch (config.provider) {
    case 'plane':
      return new PlaneBoardProvider(config.config, onToolEvent);
    case 'github':
      return new GithubBoardProvider(config.config, onToolEvent);
  }
}

export type {
  BoardConfig,
  BoardKind,
  BoardProvider,
  BoardProjectRef,
  BoardIssueRef,
} from './types.js';
