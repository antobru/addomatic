import type { AgentTool, PipelineContext, StageConfig } from '@addomatic/core';
import { sleep } from '../utils/sleep.js';
import { callTool } from '../utils/call-tool.js';
import { markdownToHtml } from '../utils/markdown.js';
import type { PmAiToolEvent } from '../types.js';

export function planeReportStage(
  toolMap: Record<string, AgentTool>,
  onToolEvent?: (e: PmAiToolEvent) => void,
): StageConfig {
  return {
    type: 'action',
    name: 'plane-report',
    execute: async (ctx: PipelineContext): Promise<string> => {
      try {
        const setupData = JSON.parse(ctx.stages['plane-setup']?.output ?? '{}') as {
          project_id?: string | null;
          error?: string;
        };
        if (setupData.error || !setupData.project_id) {
          throw new Error(setupData.error ?? 'project_id mancante da plane-setup');
        }

        const reportHtml = markdownToHtml(ctx.stages['final-report']?.output ?? '');

        const pdfText = ctx.stages['extract-pdf']?.output ?? '';
        const pdfSection = pdfText
          ? '<hr><h2>Documenti Allegati (testo estratto)</h2>' +
            '<pre style="white-space:pre-wrap;font-size:0.85em">' +
            pdfText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
            '</pre>'
          : '';

        const createPage = toolMap['plane_create_page'];
        if (!createPage) throw new Error('tool plane_create_page non disponibile');
        await sleep(300);
        const raw = await callTool(
          createPage,
          { project_id: setupData.project_id, name: 'Documento di Stima Progetto', description_html: reportHtml + pdfSection },
          'plane-report',
          onToolEvent,
        );
        if (raw.startsWith('Errore')) throw new Error(raw);
        return raw;
      } catch (e) {
        return JSON.stringify({ error: (e as Error).message, page_id: null });
      }
    },
  };
}
