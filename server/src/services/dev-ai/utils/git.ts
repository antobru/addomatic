import type { DevAiAuth } from '../types.js';
import { runProcess } from './process.js';
import { dockerExec } from './docker.js';

export function buildCloneUrl(url: string, auth: DevAiAuth): string {
  if (auth.type === 'ssh') return url;
  // Embed PAT into the HTTPS URL: https://token@github.com/owner/repo.git
  const withGit = url.endsWith('.git') ? url : `${url}.git`;
  const parsed = new URL(withGit);
  parsed.username = 'oauth2';
  parsed.password = encodeURIComponent(auth.token);
  return parsed.toString();
}

export function generateBranchName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 35);
  const suffix = Date.now().toString(36);
  return `dev-ai/${slug}-${suffix}`;
}

export function parseRepoInfo(url: string): { owner: string; repo: string } {
  const cleaned = url.replace(/\.git$/, '');
  // SSH: git@github.com:owner/repo
  const sshMatch = cleaned.match(/git@[^:]+:(.+)\/(.+)/);
  if (sshMatch) return { owner: sshMatch[1]!, repo: sshMatch[2]! };
  // HTTPS: https://github.com/owner/repo
  const parts = new URL(cleaned).pathname.split('/').filter(Boolean);
  return { owner: parts[0]!, repo: parts[1]! };
}

export async function cloneRepoOnHost(
  url: string,
  auth: DevAiAuth,
  targetPath: string,
): Promise<void> {
  const cloneUrl = buildCloneUrl(url, auth);
  const env: NodeJS.ProcessEnv = { ...process.env };

  if (auth.type === 'ssh') {
    env['GIT_SSH_COMMAND'] = `ssh -i ${auth.keyPath} -o StrictHostKeyChecking=no -o BatchMode=yes`;
  }

  const result = await runProcess(
    ['git', 'clone', '--depth=1', cloneUrl, targetPath],
    { env, timeoutMs: 180_000 },
  );

  if (result.exitCode !== 0) {
    throw new Error(`git clone failed: ${result.stderr}`);
  }
}

export async function installGit(containerId: string): Promise<void> {
  const result = await dockerExec(containerId, 'git --version || (apt-get update -qq && apt-get install -y -qq git)');
  if (result.exitCode !== 0) {
    throw new Error(`git install failed: ${result.stderr}`);
  }
}

export async function configureGitUser(containerId: string): Promise<void> {
  await dockerExec(containerId, 'git -C /workspace config user.email "dev-ai@swarn-agent.local"');
  await dockerExec(containerId, 'git -C /workspace config user.name "Dev AI"');
}

export async function createBranch(containerId: string, branchName: string): Promise<void> {
  const result = await dockerExec(containerId, `git -C /workspace checkout -b "${branchName}"`);
  if (result.exitCode !== 0) {
    throw new Error(`git checkout -b failed: ${result.stderr}`);
  }
}

export async function getGitDiff(containerId: string, baseBranch: string): Promise<string> {
  const result = await dockerExec(
    containerId,
    `git -C /workspace diff origin/${baseBranch}...HEAD`,
  );
  return result.stdout || '(no changes)';
}

export async function stageAndCommit(containerId: string, message: string): Promise<string> {
  await dockerExec(containerId, 'git -C /workspace add -A');

  const safeMsg = message.replace(/"/g, '\\"');
  const commitResult = await dockerExec(
    containerId,
    `git -C /workspace commit -m "${safeMsg}" --allow-empty`,
  );
  if (commitResult.exitCode !== 0) {
    throw new Error(`git commit failed: ${commitResult.stderr}`);
  }

  const hashResult = await dockerExec(containerId, 'git -C /workspace rev-parse HEAD');
  return hashResult.stdout.trim();
}

export async function pushBranch(containerId: string, branchName: string): Promise<void> {
  const result = await dockerExec(
    containerId,
    `git -C /workspace push origin "${branchName}"`,
    { timeoutMs: 60_000 },
  );
  if (result.exitCode !== 0) {
    throw new Error(`git push failed: ${result.stderr}`);
  }
}
