import { PlaneError } from '@makeplane/plane-node-sdk';

export function ok(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function err(e: unknown): string {
  if (e instanceof PlaneError) {
    const detail = e.response ? ` — ${JSON.stringify(e.response)}` : '';
    return `Errore ${e.statusCode}: ${e.message}${detail}`;
  }
  return `Errore: ${e instanceof Error ? e.message : String(e)}`;
}
