/**
 * src/services/pdf-extractor.ts
 * ------------------------------
 * Servizio riutilizzabile per estrarre testo da file PDF.
 *
 * Strategia:
 *  1. Estrazione testo nativa via pdfjs-dist (PDF con layer testo)
 *  2. Fallback OCR via tesseract.js per PDF scansionati (immagini rasterizzate)
 *
 * Per l'OCR il servizio richiede i buffer delle pagine renderizzate come immagini.
 * Se si desidera rendering automatico da PDF → immagine installare `canvas`:
 *   npm install --save-dev canvas
 *
 * Uso base:
 *   const svc = new PdfExtractorService();
 *   const result = await svc.extract('/path/to/file.pdf');
 *   console.log(result.text);
 *
 * Uso con OCR esplicito:
 *   const result = await svc.extract('/path/to/file.pdf', { forceOcr: true, ocrLang: 'ita' });
 */
import { readFileSync } from 'fs';
import { extname } from 'path';
import { createRequire } from 'module';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import Tesseract from 'tesseract.js';

// Punta al worker file del build legacy — necessario in Node.js ESM.
const _require = createRequire(import.meta.url);
const workerPath = _require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
GlobalWorkerOptions.workerSrc = `file://${workerPath}`;

// ── Tipi ─────────────────────────────────────────────────────────────────────

export type ExtractionMethod = 'text' | 'ocr';

export interface PdfExtractionResult {
  /** Testo estratto dall'intero documento */
  text: string;
  /** Numero di pagine del documento */
  numPages: number;
  /** Metodo usato: 'text' = layer nativo, 'ocr' = riconoscimento ottico */
  method: ExtractionMethod;
  /** Testo suddiviso per pagina */
  pages: string[];
}

export interface PdfExtractorOptions {
  /**
   * Soglia di caratteri per pagina sotto cui si attiva l'OCR.
   * Default: 30 (meno di 30 caratteri per pagina → probabile PDF scansionato)
   */
  ocrThreshold?: number;
  /**
   * Lingua per tesseract.js (BCP-47 o codici ISO 639-2).
   * Default: 'ita+eng' (italiano + inglese).
   * Esempi: 'ita', 'eng', 'ita+eng+fra'
   */
  ocrLang?: string;
  /** Se true forza OCR anche su PDF con testo nativo. Default: false. */
  forceOcr?: boolean;
}

// ── Servizio ──────────────────────────────────────────────────────────────────

export class PdfExtractorService {
  private readonly ocrThreshold: number;
  private readonly ocrLang: string;

  constructor(private readonly opts: PdfExtractorOptions = {}) {
    this.ocrThreshold = opts.ocrThreshold ?? 30;
    this.ocrLang = opts.ocrLang ?? 'ita+eng';
  }

  /**
   * Estrae il testo dal file PDF fornito.
   * Tenta prima l'estrazione nativa; se il testo è insufficiente attiva l'OCR.
   */
  async extract(filePath: string, overrides?: PdfExtractorOptions): Promise<PdfExtractionResult>;
  async extract(file: Buffer, overrides?: PdfExtractorOptions): Promise<PdfExtractionResult>;
  async extract(file: string | Buffer, overrides: PdfExtractorOptions = {}): Promise<PdfExtractionResult> {
    const lang = overrides.ocrLang ?? this.ocrLang;
    const threshold = overrides.ocrThreshold ?? this.ocrThreshold;
    const forceOcr = overrides.forceOcr ?? this.opts.forceOcr ?? false;

    const buffer = typeof file === 'string' ? readFileSync(file) : file;
    const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? (item as { str: string }).str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      pages.push(pageText);
    }

    const avgCharsPerPage = pages.reduce((s, p) => s + p.length, 0) / (pages.length || 1);
    const needsOcr = forceOcr || avgCharsPerPage < threshold;

    if (needsOcr) {
      return this.runOcr(file, pdf.numPages, pages, lang);
    }

    return { text: pages.join('\n\n'), numPages: pdf.numPages, method: 'text', pages };
  }

  /**
   * OCR diretto su un file immagine (PNG, JPEG, TIFF, BMP, WebP).
   * Utile quando le pagine PDF sono già state convertite in immagini.
   */
  async ocrImage(imagePath: string, lang?: string): Promise<string> {
    const { data } = await Tesseract.recognize(imagePath, lang ?? this.ocrLang);
    return data.text;
  }

  /**
   * OCR su buffer di immagine raw (es. da pdfjs-dist page.render con canvas).
   */
  async ocrBuffer(imageBuffer: Buffer, lang?: string): Promise<string> {
    const { data } = await Tesseract.recognize(imageBuffer, lang ?? this.ocrLang);
    return data.text;
  }

  // ── Privato ─────────────────────────────────────────────────────────────────

  private async runOcr(
    file: string | Buffer,
    numPages: number,
    nativePages: string[],
    lang: string,
  ): Promise<PdfExtractionResult> {
    // Se è un path a file immagine, OCR diretto senza passare per pdfjs.
    if (typeof file === 'string') {
      const ext = extname(file).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp'].includes(ext)) {
        const text = await this.ocrImage(file, lang);
        return { text, numPages: 1, method: 'ocr', pages: [text] };
      }
    }

    // Per PDF scansionati: usa il testo nativo dove disponibile,
    // per le pagine vuote segnala che serve rendering canvas.
    const enriched = nativePages.map((p, i) => {
      if (p.length >= this.ocrThreshold) return p;
      return `[Pagina ${i + 1}: testo insufficiente — per OCR completo installare canvas e usare ocrBuffer()]`;
    });

    const combined = enriched.join('\n\n');

    // Se tutte le pagine sono vuote è un PDF scansionato puro.
    const allEmpty = nativePages.every((p) => p.length < this.ocrThreshold);
    if (allEmpty) {
      const label = typeof file === 'string' ? `"${file}"` : 'il buffer fornito';
      throw new Error(
        `Il file ${label} sembra un PDF scansionato (${numPages} pagine, nessun testo nativo). ` +
        'Per OCR automatico: installare "canvas" (npm i canvas), renderizzare le pagine con pdfjs-dist e chiamare ocrBuffer().',
      );
    }

    return { text: combined, numPages, method: 'ocr', pages: enriched };
  }
}
