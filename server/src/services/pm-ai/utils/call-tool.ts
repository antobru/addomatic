import type { AgentTool } from '@addomatic/core';
import type { PmAiToolEvent } from '../types.js';

export async function callTool(
  tool: AgentTool,
  input: Record<string, unknown>,
  stage: PmAiToolEvent['stage'],
  onToolEvent?: (e: PmAiToolEvent) => void,
): Promise<string> {
  const t0 = Date.now();
  let output: string;
  try {
    output = await tool.execute(input);
  } catch (e) {
    output = `Errore: ${e instanceof Error ? e.message : String(e)}`;
  }
  const isError = output.startsWith('Errore');
  onToolEvent?.({ stage, tool: tool.name, input, output, isError, durationMs: Date.now() - t0 });
  return output;
}
