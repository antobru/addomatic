import { Pipeline, consolePipelineLogger, type LLMProvider } from '@addomatic/core';
import type { DevAiTask, DevAiResult, DevAiServiceOptions } from './types.js';
import { analysisStage } from './stages/analysis.js';
import { implementStage } from './stages/implement.js';
import { reviewStage } from './stages/review.js';
import { commitPushStage } from './stages/commit-push.js';
import { prCreationStage } from './stages/pr-creation.js';
import { createWorkspace, removeWorkspace, detectLanguageFromHost, generateTaskId } from './utils/workspace.js';
import { startContainer, stopAndRemoveContainer, disableNetwork, pullImage, dockerExec } from './utils/docker.js';
import { cloneRepoOnHost, configureGitUser, createBranch, generateBranchName } from './utils/git.js';
import { safeParseObj } from './utils/parse.js';

export class DevAiService {
  constructor(
    private readonly llms: {
      analysis: LLMProvider;
      implementation: LLMProvider;
      review: LLMProvider;
      judge: LLMProvider;
    },
    private readonly options?: DevAiServiceOptions,
  ) {}

  async runTask(task: DevAiTask): Promise<DevAiResult> {
    const taskId = generateTaskId();
    const containerId = `dev-ai-${taskId}`;
    const branchName = generateBranchName(task.title);
    const baseBranch = task.repo.baseBranch ?? 'main';
    const maxRetries = task.verification?.maxRetries ?? this.options?.maxImplementationRetries ?? 3;
    const reviewerCount = this.options?.reviewerCount ?? 3;
    const dockerOpts = {
      memory: this.options?.docker?.memory ?? '2g',
      cpus: this.options?.docker?.cpus ?? '2.0',
    };

    let workspacePath: string | undefined;

    try {
      // ── Pre-pipeline: clone + detect language + start container ──────────
      workspacePath = await createWorkspace(this.options?.workspaceRoot);

      await cloneRepoOnHost(task.repo.url, task.repo.auth, workspacePath);

      const profile = await detectLanguageFromHost(workspacePath);
      await pullImage(profile.dockerImage);

      const sshKeyPath = task.repo.auth.type === 'ssh' ? task.repo.auth.keyPath : undefined;
      await startContainer(profile.dockerImage, workspacePath, containerId, dockerOpts, sshKeyPath);

      await configureGitUser(containerId);
      await createBranch(containerId, branchName);

      if (task.verification?.installCommand) {
        const installResult = await dockerExec(
          containerId,
          `cd /workspace && ${task.verification.installCommand}`,
          { timeoutMs: 300_000 },
        );
        if (installResult.exitCode !== 0) {
          throw new Error(`Install command failed:\n${installResult.stderr}`);
        }
      }

      await disableNetwork(containerId);

      // ── Pipeline ─────────────────────────────────────────────────────────
      const pipeline = new Pipeline(this.llms.analysis, {
        stopOnFailure: true,
        onProgress: consolePipelineLogger({ verbose: !!this.options?.verbose }),
        stages: [
          analysisStage(this.llms.analysis),
          implementStage(this.llms.implementation, task, maxRetries),
          reviewStage(this.llms.review, this.llms.judge, task, reviewerCount),
          commitPushStage(this.llms.analysis),
          prCreationStage(this.llms.analysis, task),
        ],
      });

      const originalTask = buildOriginalTask(task);
      const pipelineResult = await pipeline.run(originalTask, {
        workspacePath,
        containerId,
        branchName,
        baseBranch,
        dockerImage: profile.dockerImage,
        targetFiles: task.targetFiles?.join(', ') ?? '',
      });

      // ── Extract result fields ─────────────────────────────────────────────
      const result: DevAiResult = { pipeline: pipelineResult };

      const commitData = safeParseObj(getStageOutput(pipelineResult.stages, 'commit-push'));
      if (commitData) {
        result.commitHash = commitData['commitHash'] as string | undefined;
        result.branchName = commitData['pushedBranch'] as string | undefined;
      }

      const prData = safeParseObj(getStageOutput(pipelineResult.stages, 'pr-creation'));
      if (prData) {
        result.prUrl = (prData['prUrl'] as string | null) ?? undefined;
        result.isDraft = prData['isDraft'] as boolean | undefined;
      }

      const reviewData = safeParseObj(getStageOutput(pipelineResult.stages, 'review'));
      if (reviewData) result.reviewReport = reviewData['report'] as string | undefined;

      const implData = safeParseObj(getStageOutput(pipelineResult.stages, 'implement'));
      if (implData) result.implementationAttempts = implData['attemptsUsed'] as number | undefined;

      return result;

    } finally {
      // Cleanup always runs — even on pipeline failure
      await stopAndRemoveContainer(containerId).catch(() => {});
      if (workspacePath) await removeWorkspace(workspacePath).catch(() => {});
    }
  }
}

function buildOriginalTask(task: DevAiTask): string {
  const parts = [`Title: ${task.title}`, `\nDescription: ${task.description}`];
  if (task.acceptanceCriteria?.length) {
    parts.push(`\nAcceptance Criteria:\n${task.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}`);
  }
  return parts.join('');
}

function getStageOutput(
  stages: Array<{ stageName: string; output: string }>,
  name: string,
): string | undefined {
  return stages.find((s) => s.stageName === name)?.output;
}

