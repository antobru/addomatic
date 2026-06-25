/**
 * providers/ollama.ts
 * -------------------
 * Provider per Ollama (modelli locali: llama3.1, qwen2.5, mistral-nemo, ecc.).
 * Ollama espone un endpoint /v1/chat/completions OpenAI-compatible, quindi
 * questo adapter è un thin wrapper su OpenAICompatibleProvider.
 *
 * Prerequisiti:
 *   - Ollama in esecuzione: https://ollama.com
 *   - Modello scaricato: ollama pull llama3.1
 *
 * Uso:
 *   const provider = ollamaProvider();
 *   // oppure con endpoint custom:
 *   const provider = ollamaProvider('http://mio-server:11434');
 */
import { OpenAICompatibleProvider } from './openai-compat.js';
import type { LLMProvider } from './types.js';

export function ollamaProvider(baseURL = 'http://localhost:11434/v1'): LLMProvider {
  return new OpenAICompatibleProvider({
    baseURL,
    apiKey: 'ollama', // Ollama ignores the key, but fetch includes it anyway
  });
}

/** @deprecated Use ollamaProvider() factory function instead */
export class OllamaProvider extends OpenAICompatibleProvider {
  constructor(baseURL = 'http://localhost:11434/v1') {
    super({ baseURL, apiKey: 'ollama' });
  }
}
