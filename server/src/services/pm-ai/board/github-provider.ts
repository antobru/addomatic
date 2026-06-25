import type { AgentTool } from '@addomatic/core';
import { githubMcpTools, type GithubToolsConfig } from '../../../agent-tools/github/github-tools.js';
import { callTool } from '../utils/call-tool.js';
import type { PmAiToolEvent } from '../types.js';
import type {
  BoardProvider,
  BoardProjectRef,
  BoardIssueRef,
  CreateIssueInput,
  CreateReportInput,
} from './types.js';

/**
 * Mappa le azioni di board su GitHub:
 *   project -> repository, issue -> issue, dipendenza -> nota nel corpo issue,
 *   report  -> file Markdown (docs/).
 * Le issue GitHub non hanno priorita nativa: viene scritta nel corpo.
 */
export class GithubBoardProvider implements BoardProvider {
  readonly kind = 'github' as const;
  private readonly tools: Record<string, AgentTool>;
  /** issue number -> corpo corrente, per accodare le dipendenze senza perderlo. */
  private readonly bodies = new Map<string, string>();

  constructor(
    config: GithubToolsConfig,
    private readonly onToolEvent?: (e: PmAiToolEvent) => void,
  ) {
    this.tools = Object.fromEntries(githubMcpTools(config).map((t) => [t.name, t]));
  }

  private tool(name: string): AgentTool {
    const t = this.tools[name];
    if (!t) throw new Error(`tool ${name} non disponibile`);
    return t;
  }

  async createProject(input: { name: string; identifier: string }): Promise<BoardProjectRef> {
    const repo = slug(input.identifier || input.name);
    const raw = await callTool(
      this.tool('github_create_repo'),
      { name: repo, description: input.name, private: true, auto_init: true },
      'board-setup',
      this.onToolEvent,
    );
    if (raw.startsWith('Errore')) throw new Error(raw);
    const r = JSON.parse(raw) as { name: string; full_name?: string };
    return { projectId: r.name, projectName: r.full_name ?? r.name };
  }

  async createIssue(project: BoardProjectRef, input: CreateIssueInput): Promise<BoardIssueRef | null> {
    const t = this.tools['github_create_issue'];
    if (!t) return null;
    const body = input.priority && input.priority !== 'none' ? `**Priorità:** ${input.priority}` : undefined;
    const raw = await callTool(
      t,
      { repo: project.projectId, title: input.name, body },
      'board-setup',
      this.onToolEvent,
    );
    if (raw.startsWith('Errore')) return null;
    const i = JSON.parse(raw) as { number: number; title: string; body?: string | null };
    const id = String(i.number);
    this.bodies.set(id, i.body ?? body ?? '');
    return { id, name: i.title };
  }

  async linkBlockedBy(project: BoardProjectRef, issueId: string, blockerIds: string[]): Promise<void> {
    const t = this.tools['github_update_issue'];
    if (!t || blockerIds.length === 0) return;
    const refs = blockerIds.map((b) => `#${b}`).join(', ');
    const prev = this.bodies.get(issueId) ?? '';
    const body = `${prev}\n\n**Bloccata da:** ${refs}`.trim();
    await callTool(
      t,
      { repo: project.projectId, issue_number: Number(issueId), body },
      'board-setup',
      this.onToolEvent,
    );
    this.bodies.set(issueId, body);
  }

  async createReportPage(project: BoardProjectRef, input: CreateReportInput): Promise<string> {
    const content =
      input.markdown +
      (input.attachmentText
        ? `\n\n---\n\n## Documenti Allegati (testo estratto)\n\n\`\`\`\n${input.attachmentText}\n\`\`\`\n`
        : '');
    const raw = await callTool(
      this.tool('github_create_page'),
      {
        repo: project.projectId,
        path: 'docs/stima-progetto.md',
        content,
        message: `docs: ${input.title}`,
      },
      'board-report',
      this.onToolEvent,
    );
    if (raw.startsWith('Errore')) throw new Error(raw);
    return raw;
  }
}

/** Converte un nome in uno slug valido per repository GitHub. */
function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'project'
  );
}
