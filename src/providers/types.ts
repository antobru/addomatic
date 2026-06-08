/**
 * providers/types.ts
 * ------------------
 * Interfaccia LLMProvider e tipi normalizzati condivisi da tutti gli adapter.
 * Il formato interno è modellato su quello Anthropic (content blocks), che è
 * più espressivo di quello OpenAI e permette di distinguere chiaramente tra
 * testo, tool_use e tool_result senza ambiguità di role.
 */

export interface LLMTextBlock {
  type: 'text';
  text: string;
}

export interface LLMToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface LLMUserMessage {
  role: 'user';
  content: string | Array<LLMTextBlock | LLMToolResultBlock>;
}

export interface LLMAssistantMessage {
  role: 'assistant';
  content: Array<LLMTextBlock | LLMToolUseBlock>;
}

export type LLMMessage = LLMUserMessage | LLMAssistantMessage;

export interface LLMTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMChatParams {
  model: string;
  system?: string;
  messages: LLMMessage[];
  tools?: LLMTool[];
  max_tokens?: number;
  temperature?: number;
}

export interface LLMChatResponse {
  content: Array<LLMTextBlock | LLMToolUseBlock>;
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Interfaccia minima che ogni provider LLM deve implementare.
 * Un singolo metodo `chat` è tutto ciò che Agent e Aggregator richiedono.
 */
export interface LLMProvider {
  chat(params: LLMChatParams): Promise<LLMChatResponse>;
}
