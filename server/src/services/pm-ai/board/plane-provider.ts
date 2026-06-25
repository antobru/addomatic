import type { AgentTool } from '@addomatic/core';
import { planeMcpTools, type PlaneToolsConfig } from '../../../agent-tools/plane/plane-tools.js';
import { callTool } from '../utils/call-tool.js';
import { markdownToHtml } from '../utils/markdown.js';
import type { PmAiToolEvent } from '../types.js';
import type {
  BoardProvider,
  BoardProjectRef,
  BoardIssueRef,
  CreateIssueInput,
  CreateReportInput,
} from './types.js';

export class PlaneBoardProvider implements BoardProvider {
  readonly kind = 'plane' as const;
  private readonly tools: Record<string, AgentTool>;

  constructor(
    config: PlaneToolsConfig,
    private readonly onToolEvent?: (e: PmAiToolEvent) => void,
  ) {
    this.tools = Object.fromEntries(planeMcpTools(config).map((t) => [t.name, t]));
  }

  private tool(name: string): AgentTool {
    const t = this.tools[name];
    if (!t) throw new Error(`tool ${name} non disponibile`);
    return t;
  }

  async createProject(input: { name: string; identifier: string }): Promise<BoardProjectRef> {
    const raw = await callTool(
      this.tool('plane_create_project'),
      { name: input.name, identifier: input.identifier },
      'board-setup',
      this.onToolEvent,
    );
    if (raw.startsWith('Errore')) throw new Error(raw);
    const p = JSON.parse(raw) as { id: string; name: string };
    return { projectId: p.id, projectName: p.name };
  }

  async createIssue(project: BoardProjectRef, input: CreateIssueInput): Promise<BoardIssueRef | null> {
    const t = this.tools['plane_create_issue'];
    if (!t) return null;
    const raw = await callTool(
      t,
      { project_id: project.projectId, name: input.name, priority: input.priority },
      'board-setup',
      this.onToolEvent,
    );
    if (raw.startsWith('Errore')) return null;
    const i = JSON.parse(raw) as { id: string; name: string };
    return { id: i.id, name: i.name };
  }

  async linkBlockedBy(project: BoardProjectRef, issueId: string, blockerIds: string[]): Promise<void> {
    const t = this.tools['plane_create_relation'];
    if (!t || blockerIds.length === 0) return;
    await callTool(
      t,
      {
        project_id: project.projectId,
        issue_id: issueId,
        relation_type: 'blocked_by',
        related_issue_ids: blockerIds,
      },
      'board-setup',
      this.onToolEvent,
    );
  }

  async createReportPage(project: BoardProjectRef, input: CreateReportInput): Promise<string> {
    const html = markdownToHtml(input.markdown) + pdfSectionHtml(input.attachmentText);
    const raw = await callTool(
      this.tool('plane_create_page'),
      { project_id: project.projectId, name: input.title, description_html: html },
      'board-report',
      this.onToolEvent,
    );
    if (raw.startsWith('Errore')) throw new Error(raw);
    return raw;
  }
}

function pdfSectionHtml(text?: string): string {
  if (!text) return '';
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (
    '<hr><h2>Documenti Allegati (testo estratto)</h2>' +
    `<pre style="white-space:pre-wrap;font-size:0.85em">${escaped}</pre>`
  );
}
