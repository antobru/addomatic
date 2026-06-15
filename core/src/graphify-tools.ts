/**
 * graphify-tools.ts
 * -----------------
 * Tool AgentTool per interrogare un knowledge graph Graphify durante task di sviluppo.
 *
 * Graphify (https://github.com/safishamsi/graphify) trasforma una codebase in un
 * knowledge graph interrogabile. Riduce il costo dei query ~71x rispetto a inviare
 * file interi al modello. Deve essere installato separatamente:
 *   pip install graphifyy   oppure   uv tool install graphifyy
 *
 * Dopo l'installazione, costruisci il graph nella directory del progetto:
 *   graphify
 * Questo genera graphify-out/GRAPH_REPORT.md, graph.json e graph.html.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import type { AgentTool } from '../types.js';

const execFileAsync = promisify(execFile);

const MSG_NOT_INSTALLED =
  'graphify non è installato o non è nel PATH.\n' +
  'Installa con:  pip install graphifyy  oppure  uv tool install graphifyy\n' +
  'Poi esegui "graphify" nella directory del progetto per costruire il knowledge graph.';

function msgNotBuilt(cwd: string): string {
  return (
    `Il knowledge graph non esiste in "${join(cwd, 'graphify-out')}".\n` +
    'Esegui "graphify" nella directory del progetto per costruire il knowledge graph.'
  );
}

/**
 * Interroga il knowledge graph Graphify per un simbolo, file o concetto.
 * Sicuro contro shell injection: gli argomenti vengono passati come array senza shell.
 */
export function graphifyQueryTool(opts?: { cwd?: string }): AgentTool {
  const defaultCwd = opts?.cwd ?? process.cwd();
  return {
    name: 'graphify_query',
    description:
      "Interroga il knowledge graph della codebase per trovare un simbolo, file o concetto. " +
      "Restituisce i nodi corrispondenti con path del file, numero di riga, tipo e relazioni. " +
      "Usalo prima di leggere file per localizzare rapidamente il codice rilevante.",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: "Nome del simbolo, classe, funzione o concetto da cercare nel knowledge graph.",
        },
        cwd: {
          type: 'string',
          description: "Directory contenente graphify-out/. Default: la directory corrente del processo.",
        },
      },
      required: ['query'],
    },
    execute: async (input) => {
      const query = String(input['query'] ?? '').trim();
      if (!query) return "Errore: il parametro 'query' non può essere vuoto.";
      const targetCwd = String(input['cwd'] ?? defaultCwd);

      try {
        const { stdout } = await execFileAsync('graphify', ['query', query], {
          cwd: targetCwd,
          timeout: 15_000,
        });
        return stdout.trim() || `Nessun risultato per "${query}" nel knowledge graph.`;
      } catch (e: unknown) {
        const err = e as { code?: string; stderr?: string; message?: string };
        if (err.code === 'ENOENT') return MSG_NOT_INSTALLED;
        const stderr = (err.stderr ?? '').trim();
        if (stderr.includes('graphify-out') || stderr.includes('graph.json') || stderr.includes('No such file')) {
          return msgNotBuilt(targetCwd);
        }
        return `Errore graphify query: ${err.message ?? String(e)}`;
      }
    },
  };
}

/**
 * Legge il GRAPH_REPORT.md generato da Graphify — panoramica della struttura della
 * codebase, moduli chiave, connessioni e domande suggerite per l'esplorazione.
 */
export function graphifyReportTool(opts?: { cwd?: string }): AgentTool {
  const defaultCwd = opts?.cwd ?? process.cwd();
  const MAX_CHARS = 6000;
  return {
    name: 'graphify_report',
    description:
      "Legge il GRAPH_REPORT.md generato da graphify: panoramica della struttura della codebase, " +
      "moduli chiave, connessioni sorprendenti e domande suggerite per l'esplorazione. " +
      "Chiamalo all'inizio di un task di sviluppo per orientarti sulla codebase.",
    input_schema: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: "Directory contenente graphify-out/. Default: la directory corrente del processo.",
        },
      },
    },
    execute: async (input) => {
      const targetCwd = String(input['cwd'] ?? defaultCwd);
      const reportPath = join(targetCwd, 'graphify-out', 'GRAPH_REPORT.md');
      try {
        const content = await readFile(reportPath, 'utf8');
        if (content.length <= MAX_CHARS) return content;
        return content.slice(0, MAX_CHARS) + `\n\n... [troncato: ${content.length - MAX_CHARS} caratteri omessi]`;
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        if (err.code === 'ENOENT') return msgNotBuilt(targetCwd);
        return `Errore lettura GRAPH_REPORT.md: ${err.message ?? String(e)}`;
      }
    },
  };
}
