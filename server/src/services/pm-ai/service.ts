import {
  consolePipelineLogger,
  Pipeline,
  PdfExtractorService,
  type LLMProvider,
} from '@addomatic/core';
import type { PmAiServiceOptions, PmAiResult } from './types.js';
import { createBoardProvider } from './board/index.js';
import { extractPdfStage } from './stages/extract-pdf.js';
import { scopeAnalysisStage } from './stages/scope-analysis.js';
import { taskBreakdownStage } from './stages/task-breakdown.js';
import { estimateStage } from './stages/estimate.js';
import { riskAssessmentStage } from './stages/risk-assessment.js';
import { finalReportStage } from './stages/final-report.js';
import { boardSetupStage } from './stages/board-setup.js';
import { boardReportStage } from './stages/board-report.js';

export class PmAiService {
  private readonly pdfSvc = new PdfExtractorService({ ocrLang: 'ita+eng', ocrThreshold: 30 });

  constructor(
    private readonly llms: Record<string, LLMProvider>,
    private readonly options?: PmAiServiceOptions,
  ) { }

  async createProject(documents: Buffer[]): Promise<PmAiResult> {
    const { board: boardCfg, onToolEvent, verbose } = this.options ?? {};
    const llm = this.llms['openai']!;

    const board = boardCfg ? createBoardProvider(boardCfg, onToolEvent) : undefined;

    const pipeline = new Pipeline(llm, {
      stopOnFailure: true,
      onProgress: consolePipelineLogger({ verbose: !!verbose }),
      stages: [
        extractPdfStage(documents, this.pdfSvc),
        scopeAnalysisStage(llm),
        taskBreakdownStage(llm),
        estimateStage(llm),
        riskAssessmentStage(llm),
        finalReportStage(),
        ...(board ? [boardSetupStage(board), boardReportStage(board)] : []),
      ],
    });

    const result = await pipeline.run('Stima il progetto descritto nel PDF');

    let projectId: string | undefined;
    try {
      const raw = result.stages.find((s) => s.stageName === 'board-setup')?.output;
      if (raw) projectId = (JSON.parse(raw) as { project_id?: string | null }).project_id ?? undefined;
    } catch { /* non critico */ }

    return { pipeline: result, projectId };
  }
}
