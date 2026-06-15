import {
  consolePipelineLogger,
  Pipeline,
  PdfExtractorService,
  type AgentTool,
  type LLMProvider,
  type PipelineContext,
  type PipelineResult,
  type StageConfig,
} from '@addomatic/core';
import { planeMcpTools, type PlaneToolsConfig } from '../agent-tools/plane/plane-tools.js';

// ── Tipi pubblici ─────────────────────────────────────────────────────────────

export interface PmAiToolEvent {
  stage: 'plane-setup' | 'plane-report';
  tool: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
  durationMs: number;
}

export interface PmAiServiceOptions {
  verbose?: boolean;
  /** Se fornita, aggiunge stage 7 (plane-setup) e stage 8 (plane-report). */
  plane?: PlaneToolsConfig;
  /** Callback per ogni chiamata a un tool Plane — utile per logging strutturato. */
  onToolEvent?: (event: PmAiToolEvent) => void;
}

export interface PmAiResult {
  pipeline: PipelineResult;
  /** ID del progetto Plane creato (solo se la config Plane è fornita e ha avuto successo). */
  planeProjectId?: string;
}

// ── Helper ────────────────────────────────────────────────────────────────────

/** Esegue un AgentTool, emette l'evento e restituisce l'output grezzo. Non lancia mai. */
async function callTool(
  tool: AgentTool,
  input: Record<string, unknown>,
  stage: 'plane-setup' | 'plane-report',
  onToolEvent?: (e: PmAiToolEvent) => void,
): Promise<string> {
  const t0 = Date.now();
  let output: string;
  try {
    output = await tool.execute(input);
  } catch (e) {
    output = `Errore: ${e instanceof Error ? e.message : String(e)}`;
  }
  const isError = output.startsWith('Errore:');
  onToolEvent?.({ stage, tool: tool.name, input, output, isError, durationMs: Date.now() - t0 });
  return output;
}

/** Ricava nome e identifier progetto dalla prima riga significativa dello scope. */
function deriveProjectIdentity(scopeOutput: string): { name: string; identifier: string } {
  // Cerca il testo dopo "Obiettivo principale" se presente
  const objectiveMatch = scopeOutput.match(/obiettivo[^:\n]*:?\*{0,2}\s*\n?\s*([^\n*#\d][^\n]{5,})/i);
  const raw =
    objectiveMatch?.[1]?.trim() ??
    scopeOutput.split('\n').find((l) => l.trim() && !/^[#*\d]/.test(l.trim()))?.trim() ??
    'Progetto';

  const name = raw.slice(0, 50);
  // Identifier: lettere+cifre maiuscoli, max 8 chars + 2 casuali per evitare collisioni
  const base = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'PROJ';
  const suffix = Math.random().toString(36).slice(2, 4).toUpperCase();
  const identifier = (base + suffix).slice(0, 10);
  return { name, identifier };
}

// ── Servizio ──────────────────────────────────────────────────────────────────

export class PmAiService {
  private llms: { [key: string]: LLMProvider };
  private options?: PmAiServiceOptions;
  private pdfSvc = new PdfExtractorService({
    ocrLang: 'ita+eng',
    ocrThreshold: 30,
  });

  constructor(llms: { [key: string]: LLMProvider }, options?: PmAiServiceOptions) {
    this.llms = llms;
    this.options = options;
  }

  async createProject(documents: Buffer[]): Promise<PmAiResult> {
    const planeCfg = this.options?.plane;
    const onToolEvent = this.options?.onToolEvent;

    // Crea tutti i tool Plane e li indicizza per nome
    const allPlaneTools = planeCfg ? planeMcpTools(planeCfg) : [];
    const planeToolMap = Object.fromEntries(allPlaneTools.map((t) => [t.name, t]));

    // ── Stage 7+8 opzionali ───────────────────────────────────────────────────
    // Usano action stages (non agent): chiamano AgentTool.execute() direttamente,
    // senza LLM nel loop. Questo elimina non-determinismo e rischio maxIterations.
    const planeStages: StageConfig[] = planeCfg
      ? [
          // ─────────────────────────────────────────────────────────────────────
          // Stage 7: plane-setup — crea progetto + una issue per ogni TASK-N
          // Legge: scope-analysis (nome progetto) + task-breakdown (lista TASK-N)
          // Emette PmAiToolEvent per ogni chiamata Plane
          // ─────────────────────────────────────────────────────────────────────
          {
            type: 'action',
            name: 'plane-setup',
            execute: async (ctx: PipelineContext): Promise<string> => {
              try {
                // a) Parse deterministico dei TASK-N dalla WBS (stage 3)
                const wbs = ctx.stages['task-breakdown']?.output ?? '';
                const taskLines = wbs
                  .split('\n')
                  .filter((l) => /^TASK-\d+:/i.test(l.trim()));

                // b) Nome + identifier del progetto dallo scope (stage 2)
                const scope = ctx.stages['scope-analysis']?.output ?? '';
                const { name: projectName, identifier } = deriveProjectIdentity(scope);

                // c) Crea il progetto Plane
                const createProject = planeToolMap['plane_create_project'];
                if (!createProject) throw new Error('tool plane_create_project non disponibile');
                const projectRaw = await callTool(
                  createProject,
                  { name: projectName, identifier },
                  'plane-setup',
                  onToolEvent,
                );
                if (projectRaw.startsWith('Errore:')) throw new Error(projectRaw);
                const project = JSON.parse(projectRaw) as { id: string; name: string };

                // d) Crea una issue per ogni TASK-N
                const createIssue = planeToolMap['plane_create_issue'];
                const issues: Array<{ id: string; name: string }> = [];
                if (createIssue) {
                  for (const line of taskLines) {
                    const issueName = line.trim().replace(/^TASK-\d+:\s*/i, '');
                    const raw = await callTool(
                      createIssue,
                      { project_id: project.id, name: issueName, priority: 'medium' },
                      'plane-setup',
                      onToolEvent,
                    );
                    if (!raw.startsWith('Errore:')) {
                      const issue = JSON.parse(raw) as { id: string; name: string };
                      issues.push({ id: issue.id, name: issue.name });
                    }
                  }
                }

                return JSON.stringify({
                  project_id: project.id,
                  project_name: project.name,
                  issues_created: issues.length,
                  issues,
                });
              } catch (e) {
                // Non blocca la pipeline — restituisce errore serializzato
                return JSON.stringify({ error: (e as Error).message, project_id: null });
              }
            },
          },

          // ─────────────────────────────────────────────────────────────────────
          // Stage 8: plane-report — salva il documento come pagina nel progetto
          // Legge: plane-setup (project_id) + final-report (documento Markdown)
          // ─────────────────────────────────────────────────────────────────────
          {
            type: 'action',
            name: 'plane-report',
            execute: async (ctx: PipelineContext): Promise<string> => {
              try {
                // Legge project_id dal JSON deterministico di stage 7
                const setupData = JSON.parse(ctx.stages['plane-setup']?.output ?? '{}') as {
                  project_id?: string | null;
                  error?: string;
                };
                if (setupData.error || !setupData.project_id) {
                  throw new Error(setupData.error ?? 'project_id mancante da plane-setup');
                }

                const doc = ctx.stages['final-report']?.output ?? '';
                const html =
                  '<pre>' +
                  doc
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .slice(0, 7500) +
                  '</pre>';

                const createPage = planeToolMap['plane_create_page'];
                if (!createPage) throw new Error('tool plane_create_page non disponibile');
                const raw = await callTool(
                  createPage,
                  {
                    project_id: setupData.project_id,
                    name: 'Documento di Stima Progetto',
                    description_html: html,
                  },
                  'plane-report',
                  onToolEvent,
                );
                if (raw.startsWith('Errore:')) throw new Error(raw);
                return raw;
              } catch (e) {
                return JSON.stringify({ error: (e as Error).message, page_id: null });
              }
            },
          },
        ]
      : [];

    // ── Pipeline principale ────────────────────────────────────────────────────
    const pipeline = new Pipeline(this.llms['openai']!, {
      stopOnFailure: true,
      onProgress: consolePipelineLogger({ verbose: !!this.options?.verbose }),

      stages: [

        // ─────────────────────────────────────────────────────────────────────
        // Stage 1: Estrazione testo dai PDF — action, zero API call
        // ─────────────────────────────────────────────────────────────────────
        {
          type: 'action',
          name: 'extract-pdf',
          task: 'Estrai il testo dai file PDF forniti',
          timeout: 120_000,
          execute: async (_ctx: PipelineContext): Promise<string> => {
            let documentsText = '';
            for (const [index, doc] of documents.entries()) {
              const result = await this.pdfSvc.extract(doc);
              documentsText +=
                `File ${index + 1} [PDF: ${result.numPages} pagine, metodo: ${result.method}]\n\n` +
                `${result.text}\n\n${'='.repeat(10)}\n\n`;
            }
            return documentsText;
          },
        },

        // ─────────────────────────────────────────────────────────────────────
        // Stage 2: Analisi scope — capisce il progetto prima di stimarlo
        // ─────────────────────────────────────────────────────────────────────
        {
          type: 'agent',
          name: 'scope-analysis',
          task: (ctx: PipelineContext): string =>
            "Leggi i seguenti documenti e produci un'analisi dello scope del progetto.\n\n" +
            'Identifica e descrivi:\n' +
            '1. **Obiettivo principale** del progetto\n' +
            '2. **Funzionalità richieste** (lista numerata, una per riga)\n' +
            '3. **Stack tecnologico** menzionato o inferibile\n' +
            '4. **Vincoli** noti (scadenze, budget, normative, integrazioni)\n' +
            '5. **Ambiguità o informazioni mancanti** che impattano la stima\n\n' +
            `DOCUMENTI:\n\n${ctx.previous!.output}`,
          agentConfig: {
            provider: this.llms['openai'],
            model: 'gpt-5.4',
            temperature: 0.2,
            maxTokens: 2048,
            systemPrompt:
              'Sei un senior solution architect con 15 anni di esperienza nella stima di progetti software. ' +
              'Analisi precisa, senza aggiungere assunzioni non supportate dal testo. ' +
              'Se qualcosa non è chiaro, segnalalo esplicitamente.',
          },
        },

        // ─────────────────────────────────────────────────────────────────────
        // Stage 3: Work Breakdown Structure — lista completa task (TASK-N)
        // ─────────────────────────────────────────────────────────────────────
        {
          type: 'agent',
          name: 'task-breakdown',
          task: (ctx: PipelineContext): string => {
            const scope   = ctx.stages['scope-analysis']?.output ?? '';
            const docText = ctx.stages['extract-pdf']?.output ?? '';
            return (
              'Basandoti sull\'analisi dello scope e sul documento originale, ' +
              'crea una Work Breakdown Structure (WBS) completa del progetto.\n\n' +
              'Per ogni task elenca:\n' +
              'TASK-N: <nome conciso>\n' +
              '  Descrizione: <cosa va fatto esattamente>\n' +
              '  Dipendenze: <TASK-X, TASK-Y o "nessuna">\n' +
              '  Categoria: <Frontend | Backend | Database | DevOps | Testing | Design | PM | Altro>\n\n' +
              'Includi TUTTI i task necessari: setup, sviluppo feature, test, deploy, documentazione.\n\n' +
              `ANALISI SCOPE:\n${scope}\n\n` +
              `DOCUMENTO ORIGINALE (riferimento):\n${docText.slice(0, 3000)}…`
            );
          },
          agentConfig: {
            provider: this.llms['openai'],
            model: 'gpt-5.4',
            temperature: 0.3,
            maxTokens: 3000,
            systemPrompt:
              'Sei un project manager tecnico esperto in decomposizione di progetti software complessi. ' +
              'Produci WBS complete e granulari: ogni task deve essere atomico e stimabile. ' +
              'Non omettere task "scomodi" come onboarding, code review, bug fixing, deploy. ' +
              'Usa il formato TASK-N richiesto senza deviazioni.',
          },
        },

        // ─────────────────────────────────────────────────────────────────────
        // Stage 4: Stima tempo e risorse
        // ─────────────────────────────────────────────────────────────────────
        {
          type: 'agent',
          name: 'estimate',
          task: (ctx: PipelineContext): string => {
            const tasks = ctx.previous!.output;
            const scope = ctx.stages['scope-analysis']?.output ?? '';
            return (
              'Per ogni task della WBS fornisci una stima dettagliata nel seguente formato:\n\n' +
              'TASK-N: <nome>\n' +
              '  Giorni ideali: <min>–<max> gg\n' +
              '  Figura richiesta: <Junior Dev | Mid Dev | Senior Dev | Tech Lead | Designer | DevOps | QA | PM>\n' +
              '  N. persone: <numero>\n' +
              '  Note: <assunzioni, rischi, dipendenze critiche>\n\n' +
              'Dopo la lista task, aggiungi:\n\n' +
              '## Riepilogo Risorse\n' +
              'Tabella: | Figura | Giorni totali | FTE equivalente |\n\n' +
              '## Totale Stimato\n' +
              '- Durata progetto (parallelo): X–Y settimane\n' +
              '- Effort totale: X–Y giorni/persona\n' +
              '- Team minimo consigliato: <composizione>\n\n' +
              `ANALISI SCOPE:\n${scope}\n\n` +
              `WBS:\n${tasks}`
            );
          },
          agentConfig: {
            provider: this.llms['openai'],
            model: 'gpt-5.4',
            temperature: 0.1,
            maxTokens: 3000,
            systemPrompt:
              'Sei un tech lead con esperienza in stima progetti Agile e a corpo fisso. ' +
              'Le stime sono in giorni ideali (giornata da 6h produttive). ' +
              "Usa sempre range min–max per comunicare l'incertezza. " +
              'Sii realistico: includi overhead di comunicazione, code review, bug fixing (20-30% buffer). ' +
              'Specifica sempre le assunzioni sottostanti.',
          },
        },

        // ─────────────────────────────────────────────────────────────────────
        // Stage 5: Analisi rischi
        // ─────────────────────────────────────────────────────────────────────
        {
          type: 'agent',
          name: 'risk-assessment',
          task: (ctx: PipelineContext): string => {
            const estimate = ctx.stages['estimate']?.output ?? '';
            const scope    = ctx.stages['scope-analysis']?.output ?? '';
            return (
              'Analizza i rischi che potrebbero impattare la stima del progetto.\n\n' +
              'Per ogni rischio usa il formato:\n' +
              'RISCHIO-N: <nome>\n' +
              '  Probabilità: Alta | Media | Bassa\n' +
              '  Impatto: Alto | Medio | Basso\n' +
              '  Effetto sulla stima: +X–Y giorni / blocco / nessuno\n' +
              '  Mitigazione: <azione concreta>\n\n' +
              'Considera: requisiti ambigui, dipendenze esterne, tecnologie nuove, ' +
              'team size, integrazioni complesse, vincoli di sicurezza/compliance.\n\n' +
              `SCOPE:\n${scope}\n\n` +
              `STIMA:\n${estimate}`
            );
          },
          agentConfig: {
            provider: this.llms['openai'],
            model: 'gpt-5.4',
            temperature: 0.2,
            maxTokens: 1500,
            systemPrompt:
              'Sei un risk manager specializzato in progetti software. ' +
              'Identifica rischi concreti e misurabili, non generici. ' +
              'Ogni rischio deve avere una mitigazione pratica e attuabile.',
          },
        },

        // ─────────────────────────────────────────────────────────────────────
        // Stage 6: Documento finale — transform, zero API call
        // ─────────────────────────────────────────────────────────────────────
        {
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
              '---',
              '',
              '## 1. Analisi Scope',
              '',
              scope,
              '',
              '---',
              '',
              '## 2. Work Breakdown Structure',
              '',
              wbs,
              '',
              '---',
              '',
              '## 3. Stima Tempo e Risorse',
              '',
              estimate,
              '',
              '---',
              '',
              '## 4. Analisi Rischi',
              '',
              risks,
            ].join('\n');
          },
        },

        // Stage 7 + 8: Plane integration (solo se options.plane è configurato)
        ...planeStages,
      ],
    });

    const result = await pipeline.run('Stima il progetto descritto nel PDF');

    // Estrae il project_id dal risultato di plane-setup (se presente)
    let planeProjectId: string | undefined;
    const planeSetupOutput = result.stages.find((s) => s.stageName === 'plane-setup')?.output;
    if (planeSetupOutput) {
      try {
        const data = JSON.parse(planeSetupOutput) as { project_id?: string | null };
        planeProjectId = data.project_id ?? undefined;
      } catch { /* non critico */ }
    }

    return { pipeline: result, planeProjectId };
  }
}
