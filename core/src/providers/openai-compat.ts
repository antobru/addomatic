/**
 * providers/openai-compat.ts
 * --------------------------
 * Adapter per qualsiasi API OpenAI-compatible (OpenAI, Groq, Together.ai,
 * Mistral.ai, ecc.). Usa fetch nativo — nessuna dipendenza aggiuntiva.
 *
 * Traduce il formato interno LLM ↔ formato OpenAI Chat Completions:
 *   - tool_use / tool_result blocks  ↔  tool_calls / role:'tool'
 *   - stop_reason 'tool_use'         ↔  finish_reason 'tool_calls'
 *   - input_tokens/output_tokens     ↔  prompt_tokens/completion_tokens
 *   - system prompt                  →  primo messaggio { role: 'system' }
 */
import type {
  LLMProvider,
  LLMChatParams,
  LLMChatResponse,
  LLMMessage,
  LLMTextBlock,
  LLMToolUseBlock,
} from './types.js';

export interface OpenAICompatibleOptions {
  baseURL: string;
  apiKey?: string;
  /** Header personalizzati (es. per Groq o Together.ai). */
  extraHeaders?: Record<string, string>;
}

/* -------------------------------------------------------------------------- */
/* Tipi OpenAI semplificati (solo ciò che usiamo)                             */

interface OAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OAIMessage {
  role: 'assistant' | 'user' | 'system' | 'tool';
  content: string | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
}

interface OAIResponse {
  choices: Array<{
    message: OAIMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/* -------------------------------------------------------------------------- */

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(private readonly options: OpenAICompatibleOptions) {}

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    return this.callWithRetry(params);
  }

  private async callWithRetry(params: LLMChatParams, attempt = 0): Promise<LLMChatResponse> {
    const maxAttempts = 4;
    const url = `${this.options.baseURL.replace(/\/$/, '')}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.options.extraHeaders,
    };
    if (this.options.apiKey) {
      headers['Authorization'] = `Bearer ${this.options.apiKey}`;
    }

    const oaiMessages = toOAIMessages(params);

    const body = {
      model: params.model,
      messages: oaiMessages,
      max_completion_tokens: params.max_tokens ?? 2048,
      temperature: params.temperature ?? 1,
      ...(params.tools && params.tools.length > 0
        ? {
            tools: params.tools.map((t) => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.input_schema },
            })),
            tool_choice: 'auto',
          }
        : {}),
    };

    let resp: Response;
    try {
      resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (e) {
      // Errore di rete — retriable
      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 250;
        await new Promise((r) => setTimeout(r, delay));
        return this.callWithRetry(params, attempt + 1);
      }
      throw e;
    }

    if (!resp.ok) {
      const retriable = resp.status === 429 || resp.status >= 500;
      if (retriable && attempt < maxAttempts) {
        const delay = Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 250;
        await new Promise((r) => setTimeout(r, delay));
        return this.callWithRetry(params, attempt + 1);
      }
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text}`);
    }

    const data = (await resp.json()) as OAIResponse;
    return normalizeOAIResponse(data);
  }
}

/* -------------------------------------------------------------------------- */
/* Conversione da LLMMessage[] → messaggi OpenAI                              */

function toOAIMessages(params: LLMChatParams): OAIMessage[] {
  const result: OAIMessage[] = [];

  if (params.system) {
    result.push({ role: 'system', content: params.system });
  }

  for (const msg of params.messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'user', content: msg.content });
        continue;
      }
      // Contenuto misto: testo + tool_result
      for (const block of msg.content) {
        if (block.type === 'text') {
          result.push({ role: 'user', content: block.text });
        } else {
          // tool_result → role:'tool'
          result.push({
            role: 'tool',
            content: block.content,
            tool_call_id: block.tool_use_id,
          });
        }
      }
    } else {
      // assistant
      const toolCalls = msg.content.filter((b): b is LLMToolUseBlock => b.type === 'tool_use');
      const textBlocks = msg.content.filter((b): b is LLMTextBlock => b.type === 'text');
      const textContent = textBlocks.map((b) => b.text).join('\n') || null;

      if (toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: textContent,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          })),
        });
      } else {
        result.push({ role: 'assistant', content: textContent ?? '' });
      }
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Normalizzazione risposta OpenAI → LLMChatResponse                          */

function normalizeOAIResponse(data: OAIResponse): LLMChatResponse {
  const choice = data.choices[0];
  if (!choice) throw new Error('Risposta OpenAI senza choices.');

  const msg = choice.message;
  const content: Array<LLMTextBlock | LLMToolUseBlock> = [];

  if (msg.content) {
    content.push({ type: 'text', text: msg.content });
  }

  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        input = { raw: tc.function.arguments };
      }
      content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
    }
  }

  const stopReason =
    choice.finish_reason === 'tool_calls'
      ? 'tool_use'
      : choice.finish_reason === 'length'
        ? 'max_tokens'
        : 'end_turn';

  return {
    content,
    stop_reason: stopReason,
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    },
  };
}
