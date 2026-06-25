/**
 * providers/anthropic.ts
 * ----------------------
 * Adapter per Anthropic Claude. Wrappa @anthropic-ai/sdk e traduce tra il
 * formato normalizzato LLM interno e i tipi specifici di Anthropic.
 * Il retry con exponential backoff (429/5xx) vive qui invece che in Agent,
 * perché la logica di errore è provider-specifica.
 */
import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  LLMChatParams,
  LLMChatResponse,
  LLMMessage,
  LLMTextBlock,
  LLMToolUseBlock,
} from './types.js';

export class AnthropicProvider implements LLMProvider {
  private readonly client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic(apiKey ? { apiKey } : {});
  }

  async chat(params: LLMChatParams, attempt = 0): Promise<LLMChatResponse> {
    const maxAttempts = 4;
    try {
      const tools: Anthropic.Tool[] = (params.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool.InputSchema,
      }));

      const response = await this.client.messages.create({
        model: params.model,
        max_tokens: params.max_tokens ?? 2048,
        temperature: params.temperature,
        system: params.system,
        messages: params.messages.map(toAnthropicMessage),
        ...(tools.length > 0 ? { tools } : {}),
      });

      return normalizeAnthropicResponse(response);
    } catch (e) {
      const status = (e as { status?: number }).status;
      const retriable = status === 429 || (status !== undefined && status >= 500);
      if (retriable && attempt < maxAttempts) {
        const delay = Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 250;
        await new Promise((r) => setTimeout(r, delay));
        return this.chat(params, attempt + 1);
      }
      throw e;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Conversione da LLMMessage → Anthropic.MessageParam                         */

function toAnthropicMessage(msg: LLMMessage): Anthropic.MessageParam {
  if (msg.role === 'user') {
    if (typeof msg.content === 'string') {
      return { role: 'user', content: msg.content };
    }
    const content: Anthropic.ContentBlockParam[] = msg.content.map((block) => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text } satisfies Anthropic.TextBlockParam;
      }
      return {
        type: 'tool_result',
        tool_use_id: block.tool_use_id,
        content: block.content,
        is_error: block.is_error,
      } satisfies Anthropic.ToolResultBlockParam;
    });
    return { role: 'user', content };
  }

  // assistant
  const content: Anthropic.ContentBlockParam[] = msg.content.map((block) => {
    if (block.type === 'text') {
      return { type: 'text', text: block.text } satisfies Anthropic.TextBlockParam;
    }
    return {
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input: block.input,
    } satisfies Anthropic.ToolUseBlockParam;
  });
  return { role: 'assistant', content };
}

/* -------------------------------------------------------------------------- */
/* Normalizzazione risposta Anthropic → LLMChatResponse                       */

function normalizeAnthropicResponse(response: Anthropic.Message): LLMChatResponse {
  const content: Array<LLMTextBlock | LLMToolUseBlock> = response.content
    .filter((b): b is Anthropic.TextBlock | Anthropic.ToolUseBlock =>
      b.type === 'text' || b.type === 'tool_use',
    )
    .map((b) => {
      if (b.type === 'text') return { type: 'text', text: b.text };
      return { type: 'tool_use', id: b.id, name: b.name, input: b.input as Record<string, unknown> };
    });

  const stopReason =
    response.stop_reason === 'tool_use'
      ? 'tool_use'
      : response.stop_reason === 'max_tokens'
        ? 'max_tokens'
        : 'end_turn';

  return {
    content,
    stop_reason: stopReason,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}
