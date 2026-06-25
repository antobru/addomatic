// ── ANSI escape codes ─────────────────────────────────────────────────────────
export const R       = '\x1b[0m';
export const B       = '\x1b[1m';   // bold
export const D       = '\x1b[2m';   // dim
export const RED     = '\x1b[31m';
export const GREEN   = '\x1b[32m';
export const YELLOW  = '\x1b[33m';
export const BLUE    = '\x1b[34m';
export const MAGENTA = '\x1b[35m';
export const CYAN    = '\x1b[36m';
export const GRAY    = '\x1b[90m';

export const CLR = '\r\x1b[K'; // move to col 0 and clear current line

export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}
