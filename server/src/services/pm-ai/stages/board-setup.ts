import type { PipelineContext, StageConfig } from '@addomatic/core';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
import { parseWbsTasks, deriveProjectIdentity } from '../utils/wbs.js';
import type { BoardProvider } from '../board/index.js';

/**
 * Crea progetto + issue + dipendenze sul board configurato (Plane, GitHub, ...).
 * Provider-agnostico: tutta la specificita sta nel BoardProvider.
 */
export function boardSetupStage(provider: BoardProvider): StageConfig {
  return {
    type: 'action',
    name: 'board-setup',
    execute: async (ctx: PipelineContext): Promise<string> => {
      try {
        const tasks = parseWbsTasks(ctx.stages['task-breakdown']?.output ?? '');
        const { name, identifier } = deriveProjectIdentity(ctx.stages['scope-analysis']?.output ?? '');

        const project = await provider.createProject({ name, identifier });

        const taskIdToIssueId = new Map<string, string>();
        const issues: Array<{ id: string; name: string }> = [];
        for (const task of tasks) {
          await sleep(300);
          const issue = await provider.createIssue(project, task);
          if (issue) {
            taskIdToIssueId.set(task.taskId, issue.id);
            issues.push(issue);
          }
        }

        for (const task of tasks) {
          if (task.deps.length === 0) continue;
          const issueId = taskIdToIssueId.get(task.taskId);
          if (!issueId) continue;
          const blockerIds = task.deps
            .map((d) => taskIdToIssueId.get(d))
            .filter((id): id is string => !!id);
          if (blockerIds.length > 0) {
            await sleep(300);
            await provider.linkBlockedBy(project, issueId, blockerIds);
          }
        }

        return JSON.stringify({
          provider: provider.kind,
          project_id: project.projectId,
          project_name: project.projectName,
          issues_created: issues.length,
          issues,
        });
      } catch (e) {
        return JSON.stringify({ error: (e as Error).message, project_id: null });
      }
    },
  };
}
