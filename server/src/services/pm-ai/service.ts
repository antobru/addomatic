import {
  consolePipelineLogger,
  Pipeline,
  PdfExtractorService,
  type LLMProvider,
  type StageConfig,
} from '@addomatic/core';
import { planeMcpTools } from '../../agent-tools/plane/plane-tools.js';
import type { PmAiServiceOptions, PmAiResult } from './types.js';
import { extractPdfStage } from './stages/extract-pdf.js';
import { scopeAnalysisStage } from './stages/scope-analysis.js';
import { taskBreakdownStage } from './stages/task-breakdown.js';
import { estimateStage } from './stages/estimate.js';
import { riskAssessmentStage } from './stages/risk-assessment.js';
import { finalReportStage } from './stages/final-report.js';
import { planeSetupStage } from './stages/plane-setup.js';
import { planeReportStage } from './stages/plane-report.js';

export class PmAiService {
  private readonly pdfSvc = new PdfExtractorService({ ocrLang: 'ita+eng', ocrThreshold: 30 });

  constructor(
    private readonly llms: { openai: LLMProvider },
    private readonly options?: PmAiServiceOptions,
  ) { }

  async createProject(documents: Buffer[]): Promise<PmAiResult> {
    const { plane: planeCfg, onToolEvent, verbose } = this.options ?? {};
    const llm = this.llms['openai']!;

    const toolMap = planeCfg
      ? Object.fromEntries(planeMcpTools(planeCfg).map((t) => [t.name, t]))
      : {};

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
        ...(planeCfg
          ? [planeSetupStage(toolMap, onToolEvent), planeReportStage(toolMap, onToolEvent)]
          : []),
      ],
    });

    const result = await pipeline.run('Stima il progetto descritto nel PDF');

    let planeProjectId: string | undefined;
    try {
      const raw = result.stages.find((s) => s.stageName === 'plane-setup')?.output;
      if (raw) planeProjectId = (JSON.parse(raw) as { project_id?: string | null }).project_id ?? undefined;
    } catch { /* non critico */ }

    return { pipeline: result, planeProjectId };
  }
}
