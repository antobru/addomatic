import { PlaneClient } from '@makeplane/plane-node-sdk';
import type { AgentTool } from '@addomatic/core';

export interface PlaneToolsConfig {
  workspaceSlug: string;
  apiKey?: string;
  accessToken?: string;
  baseUrl?: string;
  /** User ID usato come owner di default per i Cycles (se non fornito dall'agente). */
  defaultOwnedBy?: string;
}

/**
 * Crea un set di AgentTool per interagire con Plane.
 * Ogni tool corrisponde a un'operazione Plane e ritorna JSON stringificato.
 * In caso di errore ritorna "Errore: <message>" (mai lancia).
 */
export function planeMcpTools(config: PlaneToolsConfig): AgentTool[] {
  const client = new PlaneClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    accessToken: config.accessToken,
  });
  const ws = config.workspaceSlug;

  return [
    planeListProjectsTool(client, ws),
    planeCreateProjectTool(client, ws),
    planeListIssuesTool(client, ws),
    planeCreateIssueTool(client, ws),
    planeUpdateIssueTool(client, ws),
    planeGetIssueTool(client, ws),
    planeCreatePageTool(client, ws),
    planeListCyclesTool(client, ws),
    planeCreateCycleTool(client, ws, config.defaultOwnedBy),
    planeAddIssuesToCycleTool(client, ws),
  ];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function err(e: unknown): string {
  return `Errore: ${e instanceof Error ? e.message : String(e)}`;
}

// ── Projects ──────────────────────────────────────────────────────────────────

function planeListProjectsTool(client: PlaneClient, ws: string): AgentTool {
  return {
    name: 'plane_list_projects',
    description:
      'Elenca tutti i progetti dello workspace Plane. ' +
      'Ritorna un array JSON con id, name, identifier, description di ogni progetto.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Numero massimo di risultati (default: 50).' },
      },
    },
    execute: async (input) => {
      try {
        const result = await client.projects.list(ws, {
          limit: typeof input['limit'] === 'number' ? input['limit'] : 50,
        });
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

function planeCreateProjectTool(client: PlaneClient, ws: string): AgentTool {
  return {
    name: 'plane_create_project',
    description:
      'Crea un nuovo progetto nello workspace Plane. ' +
      'Il campo identifier deve essere unico nello workspace (es. "DEV", "MKT").',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome del progetto.' },
        identifier: {
          type: 'string',
          description: 'Identificatore breve unico (es. "DEV"). Massimo 12 caratteri maiuscoli.',
        },
        description: { type: 'string', description: 'Descrizione del progetto (opzionale).' },
      },
      required: ['name', 'identifier'],
    },
    execute: async (input) => {
      try {
        const result = await client.projects.create(ws, {
          name: String(input['name']),
          identifier: String(input['identifier']),
          description: input['description'] != null ? String(input['description']) : undefined,
        });
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

// ── Work Items (Issues) ───────────────────────────────────────────────────────

function planeListIssuesTool(client: PlaneClient, ws: string): AgentTool {
  return {
    name: 'plane_list_issues',
    description:
      'Elenca le issue (work item) di un progetto Plane. ' +
      'Ritorna un array JSON con id, name, priority, state, assignees.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'ID del progetto Plane.' },
        state: { type: 'string', description: 'Filtra per stato (ID dello stato, opzionale).' },
        assignee: { type: 'string', description: 'Filtra per assegnatario (ID utente, opzionale).' },
        limit: { type: 'number', description: 'Numero massimo di risultati (default: 50).' },
      },
      required: ['project_id'],
    },
    execute: async (input) => {
      try {
        const result = await client.workItems.list(ws, String(input['project_id']), {
          state: input['state'] != null ? String(input['state']) : undefined,
          assignee: input['assignee'] != null ? String(input['assignee']) : undefined,
          limit: typeof input['limit'] === 'number' ? input['limit'] : 50,
        });
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

function planeCreateIssueTool(client: PlaneClient, ws: string): AgentTool {
  return {
    name: 'plane_create_issue',
    description:
      'Crea una nuova issue (work item) in un progetto Plane. ' +
      'Ritorna il work item creato con il suo id.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'ID del progetto Plane.' },
        name: { type: 'string', description: 'Titolo della issue.' },
        description_html: {
          type: 'string',
          description: 'Descrizione in HTML (opzionale). Es: "<p>Descrizione</p>".',
        },
        priority: {
          type: 'string',
          enum: ['urgent', 'high', 'medium', 'low', 'none'],
          description: 'Priorita della issue (default: none).',
        },
        state: { type: 'string', description: 'ID dello stato (opzionale).' },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista di ID utente da assegnare (opzionale).',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista di ID label (opzionale).',
        },
        target_date: {
          type: 'string',
          description: 'Data di scadenza in formato ISO 8601 (opzionale). Es: "2026-12-31".',
        },
      },
      required: ['project_id', 'name'],
    },
    execute: async (input) => {
      try {
        const result = await client.workItems.create(ws, String(input['project_id']), {
          name: String(input['name']),
          description_html: input['description_html'] != null ? String(input['description_html']) : undefined,
          priority: input['priority'] as 'urgent' | 'high' | 'medium' | 'low' | 'none' | undefined,
          state: input['state'] != null ? String(input['state']) : undefined,
          assignees: Array.isArray(input['assignees']) ? (input['assignees'] as string[]) : undefined,
          labels: Array.isArray(input['labels']) ? (input['labels'] as string[]) : undefined,
          target_date: input['target_date'] != null ? String(input['target_date']) : undefined,
        });
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

function planeUpdateIssueTool(client: PlaneClient, ws: string): AgentTool {
  return {
    name: 'plane_update_issue',
    description:
      'Aggiorna una issue esistente in Plane. ' +
      'Specifica solo i campi che vuoi modificare.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'ID del progetto.' },
        issue_id: { type: 'string', description: 'ID della issue da aggiornare.' },
        name: { type: 'string', description: 'Nuovo titolo (opzionale).' },
        description_html: { type: 'string', description: 'Nuova descrizione HTML (opzionale).' },
        priority: {
          type: 'string',
          enum: ['urgent', 'high', 'medium', 'low', 'none'],
          description: 'Nuova priorita (opzionale).',
        },
        state: { type: 'string', description: 'Nuovo ID stato (opzionale).' },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Nuova lista di assegnatari (sostituisce la precedente, opzionale).',
        },
        target_date: { type: 'string', description: 'Nuova data di scadenza ISO 8601 (opzionale).' },
      },
      required: ['project_id', 'issue_id'],
    },
    execute: async (input) => {
      try {
        const result = await client.workItems.update(
          ws,
          String(input['project_id']),
          String(input['issue_id']),
          {
            name: input['name'] != null ? String(input['name']) : undefined,
            description_html: input['description_html'] != null ? String(input['description_html']) : undefined,
            priority: input['priority'] as 'urgent' | 'high' | 'medium' | 'low' | 'none' | undefined,
            state: input['state'] != null ? String(input['state']) : undefined,
            assignees: Array.isArray(input['assignees']) ? (input['assignees'] as string[]) : undefined,
            target_date: input['target_date'] != null ? String(input['target_date']) : undefined,
          },
        );
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

function planeGetIssueTool(client: PlaneClient, ws: string): AgentTool {
  return {
    name: 'plane_get_issue',
    description: 'Recupera i dettagli di una singola issue Plane tramite il suo ID.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'ID del progetto.' },
        issue_id: { type: 'string', description: 'ID della issue.' },
      },
      required: ['project_id', 'issue_id'],
    },
    execute: async (input) => {
      try {
        const result = await client.workItems.retrieve(
          ws,
          String(input['project_id']),
          String(input['issue_id']),
        );
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

// ── Pages ─────────────────────────────────────────────────────────────────────

function planeCreatePageTool(client: PlaneClient, ws: string): AgentTool {
  return {
    name: 'plane_create_page',
    description:
      'Crea una pagina di documentazione in un progetto Plane. ' +
      'Le pagine sono utili per documentazione, specifiche, note di sprint, etc.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'ID del progetto.' },
        name: { type: 'string', description: 'Titolo della pagina.' },
        description_html: {
          type: 'string',
          description: 'Contenuto della pagina in HTML (opzionale).',
        },
        access: {
          type: 'number',
          enum: [0, 1],
          description: '0 = pubblica, 1 = privata (default: 0).',
        },
      },
      required: ['project_id', 'name'],
    },
    execute: async (input) => {
      try {
        const result = await client.pages.createProjectPage(
          ws,
          String(input['project_id']),
          {
            name: String(input['name']),
            description_html: input['description_html'] != null ? String(input['description_html']) : undefined,
            access: typeof input['access'] === 'number' ? input['access'] : 0,
          },
        );
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

// ── Cycles ────────────────────────────────────────────────────────────────────

function planeListCyclesTool(client: PlaneClient, ws: string): AgentTool {
  return {
    name: 'plane_list_cycles',
    description:
      'Elenca i cicli (sprint) di un progetto Plane. ' +
      'Ritorna id, name, start_date, end_date di ogni ciclo.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'ID del progetto.' },
      },
      required: ['project_id'],
    },
    execute: async (input) => {
      try {
        const result = await client.cycles.list(ws, String(input['project_id']));
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

function planeCreateCycleTool(client: PlaneClient, ws: string, defaultOwnedBy?: string): AgentTool {
  return {
    name: 'plane_create_cycle',
    description:
      'Crea un nuovo ciclo (sprint) in un progetto Plane. ' +
      'Opzionalmente specifica date di inizio/fine in formato ISO 8601.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'ID del progetto.' },
        name: { type: 'string', description: 'Nome del ciclo / sprint.' },
        description: { type: 'string', description: 'Descrizione del ciclo (opzionale).' },
        start_date: { type: 'string', description: 'Data inizio ISO 8601 (opzionale). Es: "2026-07-01".' },
        end_date: { type: 'string', description: 'Data fine ISO 8601 (opzionale). Es: "2026-07-14".' },
        owned_by: {
          type: 'string',
          description: 'ID utente proprietario del ciclo (opzionale se configurato nel server).',
        },
      },
      required: ['project_id', 'name'],
    },
    execute: async (input) => {
      const ownedBy = input['owned_by'] != null ? String(input['owned_by']) : defaultOwnedBy;
      if (!ownedBy) {
        return "Errore: 'owned_by' e obbligatorio per creare un ciclo. Forniscilo come input o configura PLANE_OWNED_BY nel server.";
      }
      try {
        const result = await client.cycles.create(ws, String(input['project_id']), {
          name: String(input['name']),
          description: input['description'] != null ? String(input['description']) : undefined,
          start_date: input['start_date'] != null ? String(input['start_date']) : undefined,
          end_date: input['end_date'] != null ? String(input['end_date']) : undefined,
          owned_by: ownedBy,
          project_id: String(input['project_id']),
        });
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  };
}

function planeAddIssuesToCycleTool(client: PlaneClient, ws: string): AgentTool {
  return {
    name: 'plane_add_issues_to_cycle',
    description:
      'Aggiunge una o piu issue a un ciclo (sprint) Plane. ' +
      'Passare un array di ID issue da aggiungere.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'ID del progetto.' },
        cycle_id: { type: 'string', description: 'ID del ciclo.' },
        issue_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array di ID issue da aggiungere al ciclo.',
        },
      },
      required: ['project_id', 'cycle_id', 'issue_ids'],
    },
    execute: async (input) => {
      try {
        await client.cycles.addWorkItemsToCycle(
          ws,
          String(input['project_id']),
          String(input['cycle_id']),
          input['issue_ids'] as string[],
        );
        return ok({ success: true, message: 'Issue aggiunte al ciclo con successo.' });
      } catch (e) {
        return err(e);
      }
    },
  };
}
