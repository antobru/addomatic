import { Agent, type LLMProvider, type StageConfig } from '@addomatic/core';
import { createWorkspaceTools } from '../utils/tools.js';

export function analysisStage(provider: LLMProvider, model?: string): StageConfig {
  return {
    type: 'action',
    name: 'analysis',
    execute: async (ctx): Promise<string> => {
      const workspacePath = ctx.vars['workspacePath']!;
      const tools = createWorkspaceTools(workspacePath);

      const targetFilesHint = ctx.vars['targetFiles']
        ? `\nFocus especially on these files/areas (user-provided hints): ${ctx.vars['targetFiles']}`
        : '';

      const agent = new Agent(provider, {
        model: model ?? 'claude-sonnet-4-6',
        systemPrompt: `You are a senior tech lead with 15+ years of experience analyzing codebases and planning implementations.

Your job is to:
1. Explore the repository structure (start with list_directory path="." recursive=true)
2. Read the most relevant existing files to understand patterns, conventions, and architecture
3. Search for related code using search_code when needed
4. Produce a precise, actionable implementation plan

Respond ONLY with a valid JSON object — no markdown fences, no preamble:
{
  "plan": "Numbered step-by-step implementation plan",
  "filesToModify": ["relative/path/to/file.ts"],
  "filesToCreate": ["relative/path/to/new-file.ts"],
  "testFilesToModify": ["relative/path/to/file.test.ts"],
  "keyPatterns": ["naming conventions, DI patterns, import styles observed"],
  "estimatedComplexity": "low|medium|high"
}`,
        tools,
        temperature: 0.2,
        maxTokens: 4096,
        maxIterations: 12,
      });

      const task = [
        'Analyze this codebase and create a detailed implementation plan for the following task:',
        '',
        ctx.originalTask,
        targetFilesHint,
        '',
        'Start by exploring the directory structure, then read the most relevant files before producing the plan.',
      ].join('\n');

      const result = await agent.run('analysis', task);
      if (!result.success) throw new Error(`Analysis failed: ${result.error}`);

      return result.output;
    },
  };
}
