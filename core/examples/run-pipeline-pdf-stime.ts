/**
 * examples/run-pipeline-pdf-stime.ts
 * ------------------------------------
 * Pipeline di stima progetto da documento PDF.
 *
 * Workflow:
 *   1. extract-pdf      [action]    — legge il PDF, estrae testo (OCR fallback)
 *   2. scope-analysis   [agent]     — comprende il progetto: obiettivi, vincoli, tecnologie
 *   3. task-breakdown   [agent]     — WBS: lista completa task con descrizione
 *   4. estimate         [agent]     — stima tempo e risorse per ogni task
 *   5. risk-assessment  [agent]     — rischi che impattano la stima
 *   6. final-report     [transform] — assembla documento di stima professionale
 *
 * Esecuzione:
 *   tsx examples/run-pipeline-pdf-stime.ts /percorso/file.pdf
 *   PDF_PATH=/percorso/file.pdf npm run example:pdf-stime
 *
 * Requisiti:
 *   - Ollama su 81.31.154.148:11434 con modello gpt-oss:20b
 *   - File PDF leggibile (testo nativo o scansionato con canvas installato)
 */
import {
  Pipeline,
  ollamaProvider,
  consolePipelineLogger,
  type PipelineResult,
  type PipelineContext,
  OpenAICompatibleProvider,
} from "../src/index.js";
import { PdfExtractorService } from "../src/services/pdf-extractor.js";
import fs from "fs";


// ── Configurazione ────────────────────────────────────────────────────────────

const OLLAMA_URL = "http://81.31.154.148:11434/v1";
const MODEL = "gpt-oss:20b";
const PDF_PATH = process.argv[2] ?? process.env["PDF_PATH"] ?? "";

if (!PDF_PATH) {
  console.error(
    "Errore: specifica il percorso del PDF come argomento o variabile PDF_PATH.",
  );
  console.error("  tsx examples/run-pipeline-pdf-stime.ts /percorso/file.pdf");
  process.exit(1);
}

const provider = ollamaProvider(OLLAMA_URL);
const extProvider = new OpenAICompatibleProvider({
  apiKey: process.env["OPENAI_API_KEY"] ?? "",
  baseURL: "https://api.openai.com/v1",
});
const pdfSvc = new PdfExtractorService({
  ocrLang: "ita+eng",
  ocrThreshold: 30,
});

// ── Stampa report finale ──────────────────────────────────────────────────────

function report(result: PipelineResult): void {
  console.log("\n" + "═".repeat(70));
  console.log("STIMA PROGETTO");
  console.log("═".repeat(70));
  console.log(`File:   ${PDF_PATH}`);
  console.log(
    `Stage:  ${result.stats.succeededStages}/${result.stats.totalStages} ok`,
  );
  console.log(`Durata: ${(result.stats.totalDurationMs / 1000).toFixed(1)}s`);

  const failed = result.stages.filter((s) => !s.success);
  if (failed.length > 0) {
    console.log(
      "\n── Errori ─────────────────────────────────────────────────────",
    );
    for (const s of failed) {
      console.log(`  [✗] ${s.stageName}: ${s.error}`);
    }
  }

  console.log(
    "\n── Documento di stima ─────────────────────────────────────────\n",
  );
  console.log(result.final?.output ?? "(nessun output)");
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const pipeline = new Pipeline(provider, {
    stopOnFailure: true,
    onProgress: consolePipelineLogger({ verbose: false }),

    stages: [
      // ───────────────────────────────────────────────────────────────────────
      // Stage 1: Lettura PDF — action, zero API call
      // ───────────────────────────────────────────────────────────────────────
      {
        type: "action",
        name: "extract-pdf",
        task: `Estrai il testo dal file PDF: ${PDF_PATH}`,
        timeout: 120_000,
        execute: async (_ctx: PipelineContext): Promise<string> => {
          const result = await pdfSvc.extract(PDF_PATH);
          return `[PDF: ${result.numPages} pagine, metodo: ${result.method}]\n\n${result.text}`;
        },
      },

      // ───────────────────────────────────────────────────────────────────────
      // Stage 2: Analisi scope — capisce il progetto prima di stimarlo
      // ───────────────────────────────────────────────────────────────────────
      {
        type: "agent",
        name: "scope-analysis",
        task: (ctx: PipelineContext): string =>
          "Leggi il seguente documento e produci un'analisi dello scope del progetto.\n\n" +
          "Identifica e descrivi:\n" +
          "1. **Obiettivo principale** del progetto\n" +
          "2. **Funzionalità richieste** (lista numerata, una per riga)\n" +
          "3. **Stack tecnologico** menzionato o inferibile\n" +
          "4. **Vincoli** noti (scadenze, budget, normative, integrazioni)\n" +
          "5. **Ambiguità o informazioni mancanti** che impattano la stima\n\n" +
          `DOCUMENTO:\n\n${ctx.previous!.output}`,
        agentConfig: {
          // model: MODEL,
          provider: extProvider,
          model: 'gpt-5.4',
          temperature: 0.2,
          maxTokens: 2048,
          systemPrompt:
            "Sei un senior solution architect con 15 anni di esperienza nella stima di progetti software. " +
            "Analisi precisa, senza aggiungere assunzioni non supportate dal testo. " +
            "Se qualcosa non è chiaro, segnalalo esplicitamente.",
        },
      },

      // ───────────────────────────────────────────────────────────────────────
      // Stage 3: Work Breakdown Structure — lista completa task
      // ───────────────────────────────────────────────────────────────────────
      {
        type: "agent",
        name: "task-breakdown",
        task: (ctx: PipelineContext): string => {
          const scope = ctx.stages["scope-analysis"]?.output ?? "";
          const docText = ctx.stages["extract-pdf"]?.output ?? "";
          return (
            "Basandoti sull'analisi dello scope e sul documento originale, " +
            "crea una Work Breakdown Structure (WBS) completa del progetto.\n\n" +
            "Per ogni task elenca:\n" +
            "TASK-N: <nome conciso>\n" +
            "  Descrizione: <cosa va fatto esattamente>\n" +
            '  Dipendenze: <TASK-X, TASK-Y o "nessuna">\n' +
            "  Categoria: <Frontend | Backend | Database | DevOps | Testing | Design | PM | Altro>\n\n" +
            "Includi TUTTI i task necessari: setup, sviluppo feature, test, deploy, documentazione.\n\n" +
            `ANALISI SCOPE:\n${scope}\n\n` +
            `DOCUMENTO ORIGINALE (riferimento):\n${docText.slice(0, 3000)}…`
          );
        },
        agentConfig: {
          provider: extProvider,
          model: 'gpt-5.4',
          temperature: 0.3,
          maxTokens: 3000,
          systemPrompt:
            "Sei un project manager tecnico esperto in decomposizione di progetti software complessi. " +
            "Produci WBS complete e granulari: ogni task deve essere atomico e stimabile. " +
            'Non omettere task "scomodi" come onboarding, code review, bug fixing, deploy. ' +
            "Usa il formato TASK-N richiesto senza deviazioni.",
        },
      },

      // ───────────────────────────────────────────────────────────────────────
      // Stage 4: Stima tempo e risorse — cuore della pipeline
      // ───────────────────────────────────────────────────────────────────────
      {
        type: "agent",
        name: "estimate",
        task: (ctx: PipelineContext): string => {
          const tasks = ctx.previous!.output;
          const scope = ctx.stages["scope-analysis"]?.output ?? "";
          return (
            "Per ogni task della WBS fornisci una stima dettagliata nel seguente formato:\n\n" +
            "TASK-N: <nome>\n" +
            "  Giorni ideali: <min>–<max> gg\n" +
            "  Figura richiesta: <Junior Dev | Mid Dev | Senior Dev | Tech Lead | Designer | DevOps | QA | PM>\n" +
            "  N. persone: <numero>\n" +
            "  Note: <assunzioni, rischi, dipendenze critiche>\n\n" +
            "Dopo la lista task, aggiungi:\n\n" +
            "## Riepilogo Risorse\n" +
            "Tabella: | Figura | Giorni totali | FTE equivalente |\n\n" +
            "## Totale Stimato\n" +
            "- Durata progetto (parallelo): X–Y settimane\n" +
            "- Effort totale: X–Y giorni/persona\n" +
            "- Team minimo consigliato: <composizione>\n\n" +
            `ANALISI SCOPE:\n${scope}\n\n` +
            `WBS:\n${tasks}`
          );
        },
        agentConfig: {
          // model: MODEL,
          provider: extProvider,
          model: 'gpt-5.4',
          temperature: 0.1,
          maxTokens: 3000,
          systemPrompt:
            "Sei un tech lead con esperienza in stima progetti Agile e a corpo fisso. " +
            "Le stime sono in giorni ideali (giornata da 6h produttive). " +
            "Usa sempre range min–max per comunicare l'incertezza. " +
            "Sii realistico: includi overhead di comunicazione, code review, bug fixing (20-30% buffer). " +
            "Specifica sempre le assunzioni sottostanti.",
        },
      },

      // ───────────────────────────────────────────────────────────────────────
      // Stage 5: Analisi rischi — fattori che impattano la stima
      // ───────────────────────────────────────────────────────────────────────
      {
        type: "agent",
        name: "risk-assessment",
        task: (ctx: PipelineContext): string => {
          const estimate = ctx.stages["estimate"]?.output ?? "";
          const scope = ctx.stages["scope-analysis"]?.output ?? "";
          return (
            "Analizza i rischi che potrebbero impattare la stima del progetto.\n\n" +
            "Per ogni rischio usa il formato:\n" +
            "RISCHIO-N: <nome>\n" +
            "  Probabilità: Alta | Media | Bassa\n" +
            "  Impatto: Alto | Medio | Basso\n" +
            "  Effetto sulla stima: +X–Y giorni / blocco / nessuno\n" +
            "  Mitigazione: <azione concreta>\n\n" +
            "Considera: requisiti ambigui, dipendenze esterne, tecnologie nuove, " +
            "team size, integrazioni complesse, vincoli di sicurezza/compliance.\n\n" +
            `SCOPE:\n${scope}\n\n` +
            `STIMA:\n${estimate}`
          );
        },
        agentConfig: {
          // model: MODEL,
          provider: extProvider,
          model: 'gpt-5.4',
          temperature: 0.2,
          maxTokens: 1500,
          systemPrompt:
            "Sei un risk manager specializzato in progetti software. " +
            "Identifica rischi concreti e misurabili, non generici. " +
            "Ogni rischio deve avere una mitigazione pratica e attuabile.",
        },
      },

      // ───────────────────────────────────────────────────────────────────────
      // Stage 6: Documento finale — transform, zero API call
      // ───────────────────────────────────────────────────────────────────────
      {
        type: "transform",
        name: "final-report",
        transform: (ctx: PipelineContext): string => {
          const pdfMeta =
            ctx.stages["extract-pdf"]?.output.split("\n")[0] ?? "";
          const scope = ctx.stages["scope-analysis"]?.output ?? "";
          const wbs = ctx.stages["task-breakdown"]?.output ?? "";
          const estimate = ctx.stages["estimate"]?.output ?? "";
          const risks = ctx.stages["risk-assessment"]?.output ?? "";
          const date = new Date().toISOString().slice(0, 10);

          const document = [
            "# Documento di Stima Progetto",
            "",
            `_Generato il ${date}_  ·  _Fonte: ${pdfMeta}_`,
            "",
            "---",
            "",
            "## 1. Analisi Scope",
            "",
            scope,
            "",
            "---",
            "",
            "## 2. Work Breakdown Structure",
            "",
            wbs,
            "",
            "---",
            "",
            "## 3. Stima Tempo e Risorse",
            "",
            estimate,
            "",
            "---",
            "",
            "## 4. Analisi Rischi",
            "",
            risks,
          ].join("\n");

          fs.writeFileSync("stima-progetto.md", document);

          return document;
        },
      },
    ],
  });

  try {
    const result = await pipeline.run(
      `Stima il progetto descritto nel PDF: ${PDF_PATH}`,
    );
    report(result);
  } catch (e) {
    console.error("\nPipeline interrotta:", (e as Error).message);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Errore fatale:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
