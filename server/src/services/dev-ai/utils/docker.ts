import { runProcess, type ProcessResult } from './process.js';

export type DockerExecResult = ProcessResult;

export async function startContainer(
  image: string,
  workspacePath: string,
  containerId: string,
  opts: { memory: string; cpus: string },
  sshKeyPath?: string,
): Promise<void> {
  const args = [
    'docker', 'run', '-d',
    '--name', containerId,
    '-v', `${workspacePath}:/workspace`,
    `--memory=${opts.memory}`,
    `--cpus=${opts.cpus}`,
    '--network=bridge',
  ];

  if (sshKeyPath) {
    args.push('-v', `${sshKeyPath}:/root/.ssh/id_rsa:ro`);
    args.push('-e', 'GIT_SSH_COMMAND=ssh -i /root/.ssh/id_rsa -o StrictHostKeyChecking=no');
  }

  args.push(image, 'tail', '-f', '/dev/null');

  const result = await runProcess(args, { timeoutMs: 60_000 });
  if (result.exitCode !== 0) {
    throw new Error(`docker run failed: ${result.stderr}`);
  }
}

export async function dockerExec(
  containerId: string,
  command: string,
  opts: { timeoutMs?: number } = {},
): Promise<DockerExecResult> {
  return runProcess(
    ['docker', 'exec', containerId, 'sh', '-c', command],
    { timeoutMs: opts.timeoutMs ?? 120_000 },
  );
}

export async function dockerWriteFile(
  containerId: string,
  remotePath: string,
  content: string,
): Promise<void> {
  const result = await runProcess(
    ['docker', 'exec', '-i', containerId, 'sh', '-c', `mkdir -p "$(dirname "${remotePath}")" && cat > "${remotePath}"`],
    { input: content, timeoutMs: 30_000 },
  );
  if (result.exitCode !== 0) {
    throw new Error(`dockerWriteFile failed: ${result.stderr}`);
  }
}

export async function enableNetwork(containerId: string, network = 'bridge'): Promise<void> {
  await runProcess(['docker', 'network', 'connect', network, containerId]);
}

export async function disableNetwork(containerId: string, network = 'bridge'): Promise<void> {
  await runProcess(['docker', 'network', 'disconnect', network, containerId]);
}

export async function stopAndRemoveContainer(containerId: string): Promise<void> {
  await runProcess(['docker', 'stop', containerId], { timeoutMs: 30_000 });
  await runProcess(['docker', 'rm', containerId], { timeoutMs: 15_000 });
}

export async function pullImage(image: string, retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const result = await runProcess(['docker', 'pull', image], { timeoutMs: 300_000 });
    if (result.exitCode === 0) return;
    if (attempt === retries) throw new Error(`docker pull "${image}" failed: ${result.stderr}`);
    await new Promise((r) => setTimeout(r, 5_000 * attempt));
  }
}
