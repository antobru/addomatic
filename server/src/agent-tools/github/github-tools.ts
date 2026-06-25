import type { AgentTool } from '@addomatic/core';

export interface GithubToolsConfig {
  /** Personal Access Token (o GitHub App token) con scope repo. */
  token: string;
  /** Owner di default (org o utente) usato quando il tool non lo riceve in input. */
  owner: string;
  /** Base URL dell'API. Default: "https://api.github.com" (GitHub Enterprise: "https://host/api/v3"). */
  baseUrl?: string;
}

/**
 * Crea un set di AgentTool per interagire con GitHub.
 * Replica le azioni di Plane sul board di GitHub:
 *   project  -> repository
 *   issue    -> issue
 *   page     -> file Markdown (Contents API)
 *   cycle    -> milestone
 * Ogni tool ritorna JSON stringificato. In caso di errore ritorna "Errore: <message>" (mai lancia).
 */
export function githubMcpTools(config: GithubToolsConfig): AgentTool[] {
  const gh = new GithubApi(config);
  const owner = config.owner;

  return [
    githubListReposTool(gh, owner),
    githubCreateRepoTool(gh, owner),
    githubListIssuesTool(gh, owner),
    githubCreateIssueTool(gh, owner),
    githubUpdateIssueTool(gh, owner),
    githubGetIssueTool(gh, owner),
    githubCreatePageTool(gh, owner),
    githubListMilestonesTool(gh, owner),
    githubCreateMilestoneTool(gh, owner),
    githubAddIssuesToMilestoneTool(gh, owner),
  ];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function err(e: unknown): string {
  return `Errore: ${e instanceof Error ? e.message : String(e)}`;
}

/** Wrapper minimale sull'API REST di GitHub basato su fetch. */
class GithubApi {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(config: GithubToolsConfig) {
    this.token = config.token;
    this.baseUrl = (config.baseUrl ?? 'https://api.github.com').replace(/\/$/, '');
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v != null) url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API ${res.status}: ${text}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

// ── Repositories (== Plane Projects) ────────────────────────────────────────────

function githubListReposTool(gh: GithubApi, owner: string): AgentTool {
  return {
    name: 'github_list_repos',
    description:
      "Elenca le repository dell'owner GitHub (org o utente). " +
      'Ritorna un array JSON con id, name, full_name, description, private di ogni repo.',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Org o utente (default: quello configurato nel server).' },
        type: {
          type: 'string',
          enum: ['all', 'public', 'private', 'member'],
          description: 'Tipo di repo da elencare (default: all).',
        },
        limit: { type: 'number', description: 'Numero massimo di risultati per pagina (default: 50, max 100).' },
      },
    },
    execute: async (input) => {
      try {
        const o = input['owner'] != null ? String(input['owner']) : owner;
        const result = await gh.request('GET', `/users/${o}/repos`, undefined, {
          type: input['type'] != null ? String(input['type']) : 'all',
          per_page: typeof input['limit'] === 'number' ? input['limit'] : 50,
        });
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

function githubCreateRepoTool(gh: GithubApi, owner: string): AgentTool {
  return {
    name: 'github_create_repo',
    description:
      'Crea una nuova repository su GitHub. ' +
      "Se 'org' e fornito crea nella org, altrimenti nell'account utente autenticato.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome della repository.' },
        org: { type: 'string', description: 'Org in cui creare la repo (opzionale, default: account utente).' },
        description: { type: 'string', description: 'Descrizione della repository (opzionale).' },
        private: { type: 'boolean', description: 'Se true la repo e privata (default: true).' },
        auto_init: { type: 'boolean', description: 'Inizializza con un README (default: true).' },
      },
      required: ['name'],
    },
    execute: async (input) => {
      try {
        const org = input['org'] != null ? String(input['org']) : owner;
        const path = org ? `/orgs/${org}/repos` : '/user/repos';
        const result = await gh.request('POST', path, {
          name: String(input['name']),
          description: input['description'] != null ? String(input['description']) : undefined,
          private: typeof input['private'] === 'boolean' ? input['private'] : true,
          auto_init: typeof input['auto_init'] === 'boolean' ? input['auto_init'] : true,
        });
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

// ── Issues ──────────────────────────────────────────────────────────────────────

function githubListIssuesTool(gh: GithubApi, owner: string): AgentTool {
  return {
    name: 'github_list_issues',
    description:
      'Elenca le issue di una repository GitHub. ' +
      'Ritorna un array JSON con number, title, state, labels, assignees, milestone.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Nome della repository.' },
        owner: { type: 'string', description: 'Owner della repo (default: quello configurato).' },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Filtra per stato (default: open).',
        },
        assignee: { type: 'string', description: 'Filtra per assegnatario (username, opzionale).' },
        milestone: { type: 'string', description: 'Filtra per numero milestone o "*"/"none" (opzionale).' },
        labels: { type: 'string', description: 'Lista di label separate da virgola (opzionale).' },
        limit: { type: 'number', description: 'Numero massimo di risultati (default: 50, max 100).' },
      },
      required: ['repo'],
    },
    execute: async (input) => {
      try {
        const o = input['owner'] != null ? String(input['owner']) : owner;
        const result = await gh.request('GET', `/repos/${o}/${String(input['repo'])}/issues`, undefined, {
          state: input['state'] != null ? String(input['state']) : 'open',
          assignee: input['assignee'] != null ? String(input['assignee']) : undefined,
          milestone: input['milestone'] != null ? String(input['milestone']) : undefined,
          labels: input['labels'] != null ? String(input['labels']) : undefined,
          per_page: typeof input['limit'] === 'number' ? input['limit'] : 50,
        });
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

function githubCreateIssueTool(gh: GithubApi, owner: string): AgentTool {
  return {
    name: 'github_create_issue',
    description: 'Crea una nuova issue in una repository GitHub. Ritorna la issue creata con il suo number.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Nome della repository.' },
        owner: { type: 'string', description: 'Owner della repo (default: quello configurato).' },
        title: { type: 'string', description: 'Titolo della issue.' },
        body: { type: 'string', description: 'Corpo della issue in Markdown (opzionale).' },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista di username da assegnare (opzionale).',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista di label (opzionale).',
        },
        milestone: { type: 'number', description: 'Numero della milestone a cui associare la issue (opzionale).' },
      },
      required: ['repo', 'title'],
    },
    execute: async (input) => {
      try {
        const o = input['owner'] != null ? String(input['owner']) : owner;
        const result = await gh.request('POST', `/repos/${o}/${String(input['repo'])}/issues`, {
          title: String(input['title']),
          body: input['body'] != null ? String(input['body']) : undefined,
          assignees: Array.isArray(input['assignees']) ? (input['assignees'] as string[]) : undefined,
          labels: Array.isArray(input['labels']) ? (input['labels'] as string[]) : undefined,
          milestone: typeof input['milestone'] === 'number' ? input['milestone'] : undefined,
        });
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

function githubUpdateIssueTool(gh: GithubApi, owner: string): AgentTool {
  return {
    name: 'github_update_issue',
    description: 'Aggiorna una issue GitHub esistente. Specifica solo i campi da modificare.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Nome della repository.' },
        owner: { type: 'string', description: 'Owner della repo (default: quello configurato).' },
        issue_number: { type: 'number', description: 'Numero della issue da aggiornare.' },
        title: { type: 'string', description: 'Nuovo titolo (opzionale).' },
        body: { type: 'string', description: 'Nuovo corpo Markdown (opzionale).' },
        state: {
          type: 'string',
          enum: ['open', 'closed'],
          description: 'Nuovo stato (opzionale).',
        },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Nuova lista di assegnatari (sostituisce la precedente, opzionale).',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Nuova lista di label (sostituisce la precedente, opzionale).',
        },
        milestone: { type: 'number', description: 'Numero milestone (opzionale). Usa null per rimuovere.' },
      },
      required: ['repo', 'issue_number'],
    },
    execute: async (input) => {
      try {
        const o = input['owner'] != null ? String(input['owner']) : owner;
        const result = await gh.request(
          'PATCH',
          `/repos/${o}/${String(input['repo'])}/issues/${Number(input['issue_number'])}`,
          {
            title: input['title'] != null ? String(input['title']) : undefined,
            body: input['body'] != null ? String(input['body']) : undefined,
            state: input['state'] != null ? String(input['state']) : undefined,
            assignees: Array.isArray(input['assignees']) ? (input['assignees'] as string[]) : undefined,
            labels: Array.isArray(input['labels']) ? (input['labels'] as string[]) : undefined,
            milestone: typeof input['milestone'] === 'number' ? input['milestone'] : undefined,
          },
        );
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

function githubGetIssueTool(gh: GithubApi, owner: string): AgentTool {
  return {
    name: 'github_get_issue',
    description: 'Recupera i dettagli di una singola issue GitHub tramite il suo number.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Nome della repository.' },
        owner: { type: 'string', description: 'Owner della repo (default: quello configurato).' },
        issue_number: { type: 'number', description: 'Numero della issue.' },
      },
      required: ['repo', 'issue_number'],
    },
    execute: async (input) => {
      try {
        const o = input['owner'] != null ? String(input['owner']) : owner;
        const result = await gh.request(
          'GET',
          `/repos/${o}/${String(input['repo'])}/issues/${Number(input['issue_number'])}`,
        );
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

// ── Pages (== file Markdown via Contents API) ────────────────────────────────────

function githubCreatePageTool(gh: GithubApi, owner: string): AgentTool {
  return {
    name: 'github_create_page',
    description:
      'Crea una pagina di documentazione come file Markdown nella repository (Contents API). ' +
      'Utile per documentazione, specifiche, note di sprint. Se il file esiste gia va fornito lo sha per sovrascriverlo.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Nome della repository.' },
        owner: { type: 'string', description: 'Owner della repo (default: quello configurato).' },
        path: { type: 'string', description: 'Percorso del file nella repo. Es: "docs/spec.md".' },
        content: { type: 'string', description: 'Contenuto della pagina (testo/Markdown).' },
        message: { type: 'string', description: 'Messaggio di commit (opzionale).' },
        branch: { type: 'string', description: 'Branch su cui committare (opzionale, default: branch di default).' },
        sha: { type: 'string', description: 'SHA del file esistente, richiesto solo per aggiornare (opzionale).' },
      },
      required: ['repo', 'path', 'content'],
    },
    execute: async (input) => {
      try {
        const o = input['owner'] != null ? String(input['owner']) : owner;
        const path = String(input['path']);
        const result = await gh.request(
          'PUT',
          `/repos/${o}/${String(input['repo'])}/contents/${path}`,
          {
            message: input['message'] != null ? String(input['message']) : `docs: add ${path}`,
            content: Buffer.from(String(input['content']), 'utf-8').toString('base64'),
            branch: input['branch'] != null ? String(input['branch']) : undefined,
            sha: input['sha'] != null ? String(input['sha']) : undefined,
          },
        );
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

// ── Milestones (== Plane Cycles / sprint) ────────────────────────────────────────

function githubListMilestonesTool(gh: GithubApi, owner: string): AgentTool {
  return {
    name: 'github_list_milestones',
    description:
      'Elenca le milestone (sprint) di una repository GitHub. ' +
      'Ritorna number, title, state, due_on, description di ogni milestone.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Nome della repository.' },
        owner: { type: 'string', description: 'Owner della repo (default: quello configurato).' },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Filtra per stato (default: open).',
        },
      },
      required: ['repo'],
    },
    execute: async (input) => {
      try {
        const o = input['owner'] != null ? String(input['owner']) : owner;
        const result = await gh.request('GET', `/repos/${o}/${String(input['repo'])}/milestones`, undefined, {
          state: input['state'] != null ? String(input['state']) : 'open',
        });
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

function githubCreateMilestoneTool(gh: GithubApi, owner: string): AgentTool {
  return {
    name: 'github_create_milestone',
    description:
      'Crea una nuova milestone (sprint) in una repository GitHub. ' +
      'Opzionalmente specifica una data di scadenza in ISO 8601.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Nome della repository.' },
        owner: { type: 'string', description: 'Owner della repo (default: quello configurato).' },
        title: { type: 'string', description: 'Titolo della milestone / sprint.' },
        description: { type: 'string', description: 'Descrizione della milestone (opzionale).' },
        due_on: {
          type: 'string',
          description: 'Data di scadenza ISO 8601 (opzionale). Es: "2026-07-14T23:59:59Z".',
        },
      },
      required: ['repo', 'title'],
    },
    execute: async (input) => {
      try {
        const o = input['owner'] != null ? String(input['owner']) : owner;
        const result = await gh.request('POST', `/repos/${o}/${String(input['repo'])}/milestones`, {
          title: String(input['title']),
          description: input['description'] != null ? String(input['description']) : undefined,
          due_on: input['due_on'] != null ? String(input['due_on']) : undefined,
        });
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

function githubAddIssuesToMilestoneTool(gh: GithubApi, owner: string): AgentTool {
  return {
    name: 'github_add_issues_to_milestone',
    description:
      'Associa una o piu issue a una milestone (sprint) GitHub. ' +
      'Passare un array di number issue: ognuna viene aggiornata con la milestone indicata.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Nome della repository.' },
        owner: { type: 'string', description: 'Owner della repo (default: quello configurato).' },
        milestone_number: { type: 'number', description: 'Numero della milestone.' },
        issue_numbers: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array di number delle issue da associare alla milestone.',
        },
      },
      required: ['repo', 'milestone_number', 'issue_numbers'],
    },
    execute: async (input) => {
      try {
        const o = input['owner'] != null ? String(input['owner']) : owner;
        const repo = String(input['repo']);
        const milestone = Number(input['milestone_number']);
        const numbers = (input['issue_numbers'] as number[]) ?? [];
        for (const n of numbers) {
          await gh.request('PATCH', `/repos/${o}/${repo}/issues/${Number(n)}`, { milestone });
        }
        return ok({
          success: true,
          message: `${numbers.length} issue associate alla milestone ${milestone}.`,
        });
      } catch (e) {
        return err(e);
      }
    },
  };
}
