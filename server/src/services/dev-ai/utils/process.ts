import { spawn } from 'node:child_process';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runProcess(
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; timeoutMs?: number; input?: string } = {},
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const [cmd, ...rest] = args as [string, ...string[]];
    const proc = spawn(cmd, rest, {
      env: opts.env ?? process.env,
      timeout: opts.timeoutMs,
    });
    const outBufs: Buffer[] = [];
    const errBufs: Buffer[] = [];

    proc.stdout.on('data', (d: Buffer) => outBufs.push(d));
    proc.stderr.on('data', (d: Buffer) => errBufs.push(d));

    if (opts.input !== undefined) {
      proc.stdin.write(opts.input);
      proc.stdin.end();
    }

    proc.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(outBufs).toString('utf-8'),
        stderr: Buffer.concat(errBufs).toString('utf-8'),
        exitCode: code ?? 1,
      });
    });

    proc.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, exitCode: 1 });
    });
  });
}
