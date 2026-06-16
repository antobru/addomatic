import { Agent, type LLMProvider, type StageConfig } from '@addomatic/core';
import { enableNetwork, disableNetwork } from '../utils/docker.js';
import { stageAndCommit, pushBranch } from '../utils/git.js';

export function commitPushStage(provider: LLMProvider): StageConfig {
  return {
    type: 'action',
    name: 'commit-push',
    execute: async (ctx): Promise<string> => {
      const containerId = ctx.vars['containerId']!;
      const branchName = ctx.vars['branchName']!;

      const commitMessage = await generateCommitMessage(provider, ctx.originalTask);
      const commitHash = await stageAndCommit(containerId, commitMessage);

      await enableNetwork(containerId);
      try {
        await pushBranch(containerId, branchName);
      } finally {
        await disableNetwork(containerId);
      }

      return JSON.stringify({ commitHash, pushedBranch: branchName, commitMessage });
    },
  };
}

async function generateCommitMessage(provider: LLMProvider, task: string): Promise<string> {
  const agent = new Agent(provider, {
    model: 'claude-sonnet-4-6',
    systemPrompt: [
      'Generate a concise conventional commit message.',
      'Format: type(scope): short description',
      'Types: feat, fix, refactor, test, docs, chore.',
      'Max 72 characters total.',
      'Respond with ONLY the commit message — no quotes, no explanation.',
    ].join('\n'),
    temperature: 0.1,
    maxTokens: 128,
    maxIterations: 1,
  });

  const result = await agent.run(
    'commit-msg',
    `Generate a commit message for this task:\n${task.slice(0, 500)}`,
  );

  const msg = result.output.trim().replace(/^["']|["']$/g, '').slice(0, 72);
  return msg || `feat: ai-generated — ${task.slice(0, 50)}`;
}
