import type { PipelineContext, StageConfig } from '@addomatic/core';

export function finalReportStage(): StageConfig {
  return {
    type: 'transform',
    name: 'final-report',
    transform: (ctx: PipelineContext): string => {
      const pdfMeta  = ctx.stages['extract-pdf']?.output.split('\n')[0] ?? '';
      const scope    = ctx.stages['scope-analysis']?.output ?? '';
      const wbs      = ctx.stages['task-breakdown']?.output ?? '';
      const estimate = ctx.stages['estimate']?.output ?? '';
      const risks    = ctx.stages['risk-assessment']?.output ?? '';
      const date     = new Date().toISOString().slice(0, 10);

      return [
        '# Documento di Stima Progetto',
        '',
        `_Generato il ${date}_  ·  _Fonte: ${pdfMeta}_`,
        '',
        '---', '',
        '## 1. Analisi Scope', '', scope, '',
        '---', '',
        '## 2. Work Breakdown Structure', '', wbs, '',
        '---', '',
        '## 3. Stima Tempo e Risorse', '', estimate, '',
        '---', '',
        '## 4. Analisi Rischi', '', risks,
      ].join('\n');
    },
  };
}
