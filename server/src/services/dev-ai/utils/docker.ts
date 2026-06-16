import { spawn } from 'node:child_process';

export interface DockerExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runSpawn(
  args: string[],
  opts: { timeoutMs?: number; input?: string } = {},
): Promise<DockerExecResult> {
  return new Promise((resolve) => {
    const [cmd, ...rest] = args as [string, ...string[]];
    const proc = spawn(cmd, rest, { timeout: opts.timeoutMs });
    const stdoutBufs: Buffer[] = [];
    const stderrBufs: Buffer[] = [];

    proc.stdout.on('data', (d: Buffer) => stdoutBufs.push(d));
    proc.stderr.on('data', (d: Buffer) => stderrBufs.push(d));

    if (opts.input !== undefined) {
      proc.stdin.write(opts.input);
      proc.stdin.end();
    }

    proc.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(stdoutBufs).toString('utf-8'),
        stderr: Buffer.concat(stderrBufs).toString('utf-8'),
        exitCode: code ?? 1,
      });
    });

    proc.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, exitCode: 1 });
    });
  });
}

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

  const result = await runSpawn(args, { timeoutMs: 60_000 });
  if (result.exitCode !== 0) {
    throw new Error(`docker run failed: ${result.stderr}`);
  }
}

export async function dockerExec(
  containerId: string,
  command: string,
  opts: { timeoutMs?: number } = {},
): Promise<DockerExecResult> {
  return runSpawn(
    ['docker', 'exec', containerId, 'sh', '-c', command],
    { timeoutMs: opts.timeoutMs ?? 120_000 },
  );
}

export async function dockerWriteFile(
  containerId: string,
  remotePath: string,
  content: string,
): Promise<void> {
  const result = await runSpawn(
    ['docker', 'exec', '-i', containerId, 'sh', '-c', `mkdir -p "$(dirname "${remotePath}")" && cat > "${remotePath}"`],
    { input: content, timeoutMs: 30_000 },
  );
  if (result.exitCode !== 0) {
    throw new Error(`dockerWriteFile failed: ${result.stderr}`);
  }
}

export async function enableNetwork(containerId: string, network = 'bridge'): Promise<void> {
  await runSpawn(['docker', 'network', 'connect', network, containerId]);
}

export async function disableNetwork(containerId: string, network = 'bridge'): Promise<void> {
  await runSpawn(['docker', 'network', 'disconnect', network, containerId]);
}

export async function stopAndRemoveContainer(containerId: string): Promise<void> {
  await runSpawn(['docker', 'stop', containerId], { timeoutMs: 30_000 });
  await runSpawn(['docker', 'rm', containerId], { timeoutMs: 15_000 });
}

export async function pullImage(image: string): Promise<void> {
  const result = await runSpawn(['docker', 'pull', image], { timeoutMs: 300_000 });
  if (result.exitCode !== 0) {
    throw new Error(`docker pull "${image}" failed: ${result.stderr}`);
  }
}
