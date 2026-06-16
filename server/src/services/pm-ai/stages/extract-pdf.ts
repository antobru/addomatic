import type { PdfExtractorService, PipelineContext, StageConfig } from '@addomatic/core';

export function extractPdfStage(documents: Buffer[], pdfSvc: PdfExtractorService): StageConfig {
  return {
    type: 'action',
    name: 'extract-pdf',
    task: 'Estrai il testo dai file PDF forniti',
    timeout: 120_000,
    execute: async (_ctx: PipelineContext): Promise<string> => {
      let out = '';
      for (const [i, doc] of documents.entries()) {
        const r = await pdfSvc.extract(doc);
        out += `File ${i + 1} [PDF: ${r.numPages} pagine, metodo: ${r.method}]\n\n${r.text}\n\n${'='.repeat(10)}\n\n`;
      }
      return out;
    },
  };
}
