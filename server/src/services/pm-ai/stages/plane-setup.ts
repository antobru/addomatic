import type { AgentTool, PipelineContext, StageConfig } from '@addomatic/core';
import { sleep } from '../utils/sleep.js';
import { callTool } from '../utils/call-tool.js';
import { parseWbsTasks, deriveProjectIdentity } from '../utils/wbs.js';
import type { PmAiToolEvent } from '../types.js';

export function planeSetupStage(
  toolMap: Record<string, AgentTool>,
  onToolEvent?: (e: PmAiToolEvent) => void,
): StageConfig {
  return {
    type: 'action',
    name: 'plane-setup',
    execute: async (ctx: PipelineContext): Promise<string> => {
      try {
        const tasks = parseWbsTasks(ctx.stages['task-breakdown']?.output ?? '');
        const { name: projectName, identifier } = deriveProjectIdentity(ctx.stages['scope-analysis']?.output ?? '');

        const createProject = toolMap['plane_create_project'];
        if (!createProject) throw new Error('tool plane_create_project non disponibile');
        const projectRaw = await callTool(createProject,
          {
            name: projectName,
            identifier,
            page_view: true,
            cycle_view: true,
            guest_view_all_features: true,
            issue_views_view: true,
            intake_view: true,
            module_view: true,
          },
          'plane-setup', onToolEvent);
        if (projectRaw.startsWith('Errore')) throw new Error(projectRaw);
        const project = JSON.parse(projectRaw) as { id: string; name: string };

        const createIssue = toolMap['plane_create_issue'];
        const taskIdToIssueId = new Map<string, string>();
        const issues: Array<{ id: string; name: string }> = [];
        if (createIssue) {
          for (const task of tasks) {
            await sleep(300);
            const raw = await callTool(
              createIssue,
              {
                project_id: project.id,
                name: task.name,
                priority: task.priority,
              },
              'plane-setup',
              onToolEvent,
            );
            if (!raw.startsWith('Errore')) {
              const issue = JSON.parse(raw) as { id: string; name: string };
              taskIdToIssueId.set(task.taskId, issue.id);
              issues.push({ id: issue.id, name: issue.name });
            }
          }
        }

        const createRelation = toolMap['plane_create_relation'];
        if (createRelation) {
          for (const task of tasks) {
            if (task.deps.length === 0) continue;
            const issueId = taskIdToIssueId.get(task.taskId);
            if (!issueId) continue;
            const blockerIds = task.deps.map((d) => taskIdToIssueId.get(d)).filter((id): id is string => !!id);
            if (blockerIds.length > 0) {
              await sleep(300);
              await callTool(
                createRelation,
                { project_id: project.id, issue_id: issueId, relation_type: 'blocked_by', related_issue_ids: blockerIds },
                'plane-setup',
                onToolEvent,
              );
            }
          }
        }

        return JSON.stringify({ project_id: project.id, project_name: project.name, issues_created: issues.length, issues });
      } catch (e) {
        return JSON.stringify({ error: (e as Error).message, project_id: null });
      }
    },
  };
}
