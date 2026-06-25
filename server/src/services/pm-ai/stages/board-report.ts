import type { PipelineContext, StageConfig } from '@addomatic/core';
import { sleep } from '../utils/sleep.js';
import type { BoardProvider } from '../board/index.js';

/** Crea il documento di stima sul board configurato. Provider-agnostico. */
export function boardReportStage(provider: BoardProvider): StageConfig {
  return {
    type: 'action',
    name: 'board-report',
    execute: async (ctx: PipelineContext): Promise<string> => {
      try {
        const setupData = JSON.parse(ctx.stages['board-setup']?.output ?? '{}') as {
          project_id?: string | null;
          project_name?: string;
          error?: string;
        };
        if (setupData.error || !setupData.project_id) {
          throw new Error(setupData.error ?? 'project_id mancante da board-setup');
        }

        await sleep(300);
        return await provider.createReportPage(
          { projectId: setupData.project_id, projectName: setupData.project_name ?? '' },
          {
            title: 'Documento di Stima Progetto',
            markdown: ctx.stages['final-report']?.output ?? '',
            attachmentText: ctx.stages['extract-pdf']?.output ?? '',
          },
        );
      } catch (e) {
        return JSON.stringify({ error: (e as Error).message, page_id: null });
      }
    },
  };
}
