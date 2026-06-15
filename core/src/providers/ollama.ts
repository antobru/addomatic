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
 *   const provider = new OllamaProvider();
 *   // oppure con endpoint e modello custom:
 *   const provider = new OllamaProvider('http://mio-server:11434');
 */
import { OpenAICompatibleProvider } from './openai-compat.js';

export class OllamaProvider extends OpenAICompatibleProvider {
  /**
   * @param baseURL  URL di Ollama (default: http://localhost:11434/v1)
   */
  constructor(baseURL = 'http://localhost:11434/v1') {
    super({
      baseURL,
      apiKey: 'ollama', // Ollama ignora la chiave, ma fetch la include lo stesso
    });
  }
}
