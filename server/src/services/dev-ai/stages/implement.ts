import { Agent, type LLMProvider, type StageConfig } from '@addomatic/core';
import { createWorkspaceTools } from '../utils/tools.js';
import { dockerExec } from '../utils/docker.js';
import type { DevAiTask } from '../types.js';

interface AttemptRecord {
  attempt: number;
  passed: boolean;
  errors?: string;
}

export function implementStage(
  provider: LLMProvider,
  task: DevAiTask,
  maxRetries: number,
  model?: string
): StageConfig {
  return {
    type: 'action',
    name: 'implement',
    execute: async (ctx): Promise<string> => {
      const workspacePath = ctx.vars['workspacePath']!;
      const containerId = ctx.vars['containerId']!;
      const analysisOutput = ctx.stages['analysis']?.output ?? '';

      let previousErrors: string | null = null;
      let success = false;
      let finalVerificationOutput = '';
      const attemptLog: AttemptRecord[] = [];

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const tools = createWorkspaceTools(workspacePath);
        const agent = new Agent(provider, {
          model: model ?? 'claude-opus-4-8',
          systemPrompt: buildSystemPrompt(attempt > 1),
          tools,
          maxTokens: 8192,
          maxIterations: 20,
        });

        const agentTask = buildImplementationTask(ctx.originalTask, analysisOutput, previousErrors, attempt);
        const agentResult = await agent.run(`impl-${attempt}`, agentTask);

        if (!agentResult.success) {
          previousErrors = `Agent error: ${agentResult.error ?? 'unknown'}`;
          attemptLog.push({ attempt, passed: false, errors: previousErrors });
          continue;
        }

        // Run verification commands if configured
        if (task.verification?.commands?.length) {
          const { passed, errors, output } = await runVerification(
            containerId,
            task.verification.commands,
          );
          finalVerificationOutput = output;

          if (!passed) {
            previousErrors = errors;
            attemptLog.push({ attempt, passed: false, errors });
            continue;
          }
        }

        success = true;
        attemptLog.push({ attempt, passed: true });
        break;
      }

      return JSON.stringify({
        success,
        attemptsUsed: attemptLog.length,
        finalVerificationOutput,
        attemptLog,
        summary: success
          ? `Implementation completed in ${attemptLog.length} attempt(s).`
          : `Implementation failed after ${attemptLog.length} attempt(s). Last errors:\n${previousErrors ?? 'unknown'}`,
      });
    },
  };
}

function buildSystemPrompt(isRetry: boolean): string {
  return [
    'You are an expert senior software developer implementing code changes in a repository.',
    '',
    'Use the tools to:',
    '1. Read existing files to understand the current implementation and patterns',
    '2. Write new files or modify existing ones to implement the task',
    '3. List directories to navigate the codebase when needed',
    '',
    'Rules:',
    '- Follow the existing code style, naming conventions, and patterns precisely',
    '- Implement ALL required changes — do not leave TODO comments',
    '- Write production-quality code with no debugging artifacts',
    '- Do not modify files unrelated to the task',
    isRetry ? '- You are fixing errors from a previous attempt — ONLY change what is needed to fix them' : '',
  ].filter(Boolean).join('\n');
}

function buildImplementationTask(
  originalTask: string,
  analysisOutput: string,
  previousErrors: string | null,
  attempt: number,
): string {
  const parts: string[] = [
    `# Task\n${originalTask}`,
    `\n# Implementation Plan\n${analysisOutput}`,
  ];

  if (previousErrors && attempt > 1) {
    parts.push(
      `\n# ⚠️ Errors from attempt ${attempt - 1} — fix these\n\`\`\`\n${previousErrors}\n\`\`\``,
    );
  }

  parts.push('\nRead the relevant files first, then implement all required changes.');
  return parts.join('\n');
}

async function runVerification(
  containerId: string,
  commands: string[],
): Promise<{ passed: boolean; errors: string; output: string }> {
  const errorParts: string[] = [];

  for (const cmd of commands) {
    const result = await dockerExec(containerId, `cd /workspace && ${cmd}`, {
      timeoutMs: 180_000,
    });

    if (result.exitCode !== 0) {
      errorParts.push([
        `❌ Command: ${cmd}`,
        result.stdout ? `STDOUT:\n${result.stdout.slice(0, 3000)}` : '',
        result.stderr ? `STDERR:\n${result.stderr.slice(0, 3000)}` : '',
      ].filter(Boolean).join('\n'));
    }
  }

  if (errorParts.length === 0) {
    return { passed: true, errors: '', output: '✅ All verification commands passed.' };
  }

  const errors = errorParts.join('\n\n---\n\n');
  return { passed: false, errors, output: errors };
}
