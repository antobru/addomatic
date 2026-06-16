import { Agent, LLMJudgeAggregator, mapWithConcurrency, type AgentResult, type LLMProvider, type StageConfig } from '@addomatic/core';
import { getGitDiff } from '../utils/git.js';
import { createWorkspaceTools } from '../utils/tools.js';
import { dockerExec } from '../utils/docker.js';
import type { DevAiTask } from '../types.js';

interface ReviewOutput {
  passed: boolean;
  hasCritical: boolean;
  report: string;
  retryUsed: boolean;
}

export function reviewStage(
  reviewProvider: LLMProvider,
  judgeProvider: LLMProvider,
  task: DevAiTask,
  reviewerCount: number,
): StageConfig {
  return {
    type: 'action',
    name: 'review',
    execute: async (ctx): Promise<string> => {
      const containerId = ctx.vars['containerId']!;
      const baseBranch = ctx.vars['baseBranch']!;
      const workspacePath = ctx.vars['workspacePath']!;
      const implementOutput = safeParseObj(ctx.stages['implement']?.output ?? '{}');

      const diff = await getGitDiff(containerId, baseBranch);
      const reviewTask = buildReviewTask(ctx.originalTask, implementOutput, diff, task);

      const report = await runSwarmReview(reviewTask, reviewProvider, judgeProvider, reviewerCount);
      const hasCritical = report.toLowerCase().includes('[critical]');

      if (!hasCritical) {
        const out: ReviewOutput = { passed: true, hasCritical: false, report, retryUsed: false };
        return JSON.stringify(out);
      }

      // One retry: re-implement to fix critical issues, then re-review
      const tools = createWorkspaceTools(workspacePath);
      const fixAgent = new Agent(reviewProvider, {
        model: 'claude-opus-4-8',
        systemPrompt: [
          'You are an expert senior software developer fixing CRITICAL issues found during code review.',
          'Read the relevant files, then apply ONLY the targeted fixes listed in the review.',
          'Do not refactor or change anything beyond what the critical issues require.',
        ].join('\n'),
        tools,
        temperature: 0.1,
        maxTokens: 8192,
        maxIterations: 15,
      });

      await fixAgent.run(
        'review-fix',
        [
          `# Original Task\n${ctx.originalTask}`,
          `\n# Code Review — Fix CRITICAL issues only\n${report}`,
          '\nRead the relevant files first, then apply targeted fixes.',
        ].join('\n'),
      );

      // Re-run verification after the fix
      if (task.verification?.commands?.length) {
        for (const cmd of task.verification.commands) {
          await dockerExec(containerId, `cd /workspace && ${cmd}`, { timeoutMs: 180_000 });
        }
      }

      // Final review on the updated diff
      const newDiff = await getGitDiff(containerId, baseBranch);
      const finalReport = await runSwarmReview(
        buildReviewTask(ctx.originalTask, implementOutput, newDiff, task),
        reviewProvider,
        judgeProvider,
        reviewerCount,
      );
      const stillHasCritical = finalReport.toLowerCase().includes('[critical]');

      const finalOut: ReviewOutput = { passed: !stillHasCritical, hasCritical: stillHasCritical, report: finalReport, retryUsed: true };
      return JSON.stringify(finalOut);
    },
  };
}

async function runSwarmReview(
  reviewTask: string,
  reviewProvider: LLMProvider,
  judgeProvider: LLMProvider,
  count: number,
): Promise<string> {
  const agentConfig = {
    model: 'claude-sonnet-4-6',
    systemPrompt: [
      'You are a meticulous senior code reviewer.',
      'Review code changes for correctness, security, performance, and code quality.',
      'For each issue found, prefix the line with its severity:',
      '  [CRITICAL] — must be fixed before merge (bugs, security flaws, broken functionality)',
      '  [WARNING]  — should be addressed but not blocking (missing edge cases, code smell)',
      '  [SUGGESTION] — optional improvements (style, micro-optimizations)',
      'If no issues are found, write exactly: "✅ No issues found. Code is ready to merge."',
      'Be specific: reference file names and describe the exact problem.',
    ].join('\n'),
    temperature: 0.3,
    maxTokens: 2048,
  };

  const results = await mapWithConcurrency(
    Array.from({ length: count }, (_, i) => i),
    count,
    async (i): Promise<AgentResult> => {
      const agent = new Agent(reviewProvider, agentConfig);
      return agent.run(`reviewer-${i + 1}`, reviewTask);
    },
  );

  const successful = results.filter((r) => r.success && r.output.trim());
  if (successful.length === 0) return 'All reviewer agents failed — manual review required.';
  if (successful.length === 1) return successful[0]!.output;

  const aggregator = new LLMJudgeAggregator(judgeProvider, {
    model: 'claude-opus-4-8',
    synthesize: true,
    maxTokens: 2048,
  });

  const aggregated = await aggregator.aggregate(reviewTask, successful);
  return aggregated.output;
}

function buildReviewTask(
  originalTask: string,
  implOutput: Record<string, unknown> | null,
  diff: string,
  task: DevAiTask,
): string {
  const summary = String(implOutput?.['summary'] ?? '(implementation summary not available)');
  const criteria = task.acceptanceCriteria?.length
    ? `\n\n## Acceptance Criteria\n${task.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}`
    : '';

  return [
    '## Original Task',
    originalTask,
    criteria,
    '',
    '## Implementation Summary',
    summary,
    '',
    '## Git Diff',
    '```diff',
    diff.slice(0, 10_000),
    '```',
    '',
    'Review the diff above and report every issue you find with the appropriate severity prefix.',
  ].join('\n');
}

function safeParseObj(raw: string): Record<string, unknown> | null {
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch { return null; }
}
