import { Agent, type LLMProvider, type StageConfig } from '@addomatic/core';
import { createPullRequest } from '../utils/pr.js';
import type { DevAiTask } from '../types.js';
import { safeParseObj } from '../utils/parse.js';

export function prCreationStage(provider: LLMProvider, task: DevAiTask): StageConfig {
  return {
    type: 'action',
    name: 'pr-creation',
    execute: async (ctx): Promise<string> => {
      const branchName = ctx.vars['branchName']!;
      const baseBranch = ctx.vars['baseBranch']!;

      if (!task.repo.apiToken) {
        return JSON.stringify({ prUrl: null, prId: null, skipped: true, reason: 'No apiToken provided' });
      }

      const reviewOutput = safeParseObj(ctx.stages['review']?.output ?? '{}');
      const implOutput = safeParseObj(ctx.stages['implement']?.output ?? '{}');
      const analysisOutput = ctx.stages['analysis']?.output ?? '';
      const commitOutput = safeParseObj(ctx.stages['commit-push']?.output ?? '{}');
      const hasCritical = reviewOutput?.['hasCritical'] === true;

      const prTitle = `[Dev AI] ${task.title}`;
      const prBody = await generatePRBody(provider, {
        task,
        analysisOutput,
        implOutput,
        reviewOutput,
        commitOutput,
        hasCritical,
      });

      const result = await createPullRequest({
        platform: task.repo.platform,
        apiToken: task.repo.apiToken,
        apiBaseUrl: task.repo.apiBaseUrl,
        repoUrl: task.repo.url,
        branchName,
        baseBranch,
        title: prTitle,
        body: prBody,
        draft: hasCritical,
        labels: task.labels,
      });

      return JSON.stringify({
        prUrl: result.prUrl,
        prId: result.prId,
        isDraft: hasCritical,
      });
    },
  };
}

interface PRBodyContext {
  task: DevAiTask;
  analysisOutput: string;
  implOutput: Record<string, unknown> | null;
  reviewOutput: Record<string, unknown> | null;
  commitOutput: Record<string, unknown> | null;
  hasCritical: boolean;
}

async function generatePRBody(provider: LLMProvider, ctx: PRBodyContext): Promise<string> {
  const { task, analysisOutput, implOutput, reviewOutput, commitOutput, hasCritical } = ctx;

  const agent = new Agent(provider, {
    model: 'claude-sonnet-4-6',
    systemPrompt: 'Generate a well-structured GitHub Pull Request description in Markdown. Be concise and informative.',
    temperature: 0.2,
    maxTokens: 2048,
    maxIterations: 1,
  });

  const attemptsUsed = Number(implOutput?.['attemptsUsed'] ?? 1);
  const retryUsed = reviewOutput?.['retryUsed'] === true;
  const implSummary = String(implOutput?.['summary'] ?? '');
  const reviewReport = String(reviewOutput?.['report'] ?? '');
  const commitHash = String(commitOutput?.['commitHash'] ?? '');

  const context = [
    `Task title: ${task.title}`,
    `Task description: ${task.description}`,
    task.acceptanceCriteria?.length
      ? `Acceptance criteria:\n${task.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}`
      : '',
    `Analysis plan: ${analysisOutput.slice(0, 800)}`,
    `Implementation summary: ${implSummary}`,
    `Implementation attempts: ${attemptsUsed}`,
    `Review report: ${reviewReport.slice(0, 800)}`,
    `Review retry used: ${retryUsed}`,
    `Has unresolved critical issues: ${hasCritical}`,
    commitHash ? `Commit: ${commitHash}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `Generate a PR description using this exact section structure:

## Task
(title, description, acceptance criteria if any)

## Implementation Plan
(key steps from analysis)

## Changes Made
(what was implemented)

## Code Review Report
(review findings by severity)
${attemptsUsed > 1 ? '\n## Self-healing Log\n(retry details)' : ''}
${retryUsed ? '\n## Review Fix Log\n(what was fixed after review)' : ''}
${hasCritical ? '\n## ⚠️ Open Issues\n(unresolved critical issues — this is a draft PR)' : ''}

Context:
${context}`;

  const result = await agent.run('pr-body', prompt);
  return result.output || buildFallbackBody(ctx);
}

function buildFallbackBody(ctx: PRBodyContext): string {
  const { task, implOutput, reviewOutput, hasCritical } = ctx;
  const sections = [
    `## Task\n**${task.title}**\n\n${task.description}`,
    `## Changes Made\n${String(implOutput?.['summary'] ?? 'AI-generated implementation')}`,
    `## Code Review Report\n${String(reviewOutput?.['report'] ?? 'Review completed.')}`,
  ];
  if (hasCritical) {
    sections.push(
      '## ⚠️ Open Issues\nThis is a draft PR because the automated code review found unresolved critical issues. Please review the issues above before merging.',
    );
  }
  return sections.join('\n\n---\n\n');
}

