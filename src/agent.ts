/**
 * agent.ts
 * --------
 * Un singolo agente autonomo. Esegue il loop ReAct (Reason + Act):
 *
 *   1. chiama il provider LLM con il task e gli strumenti disponibili;
 *   2. se il modello richiede una tool call, la esegue e ne reinietta il
 *      risultato nella conversazione (observation);
 *   3. ripete finche' il modello produce una risposta testuale finale
 *      oppure finche' non si raggiunge il tetto di iterazioni.
 *
 * NOTA DI DESIGN: la classe e' di fatto "stateless". Tutto lo stato di una
 * esecuzione (l'array `messages`) vive dentro `run()`. Questo permette di
 * riusare la STESSA istanza Agent per tutti i worker dello swarm lanciati in
 * parallelo, senza che le esecuzioni interferiscano tra loro.
 */
import type { AgentConfig, AgentResult, AgentTool, SwarmProgressEvent, TraceStep } from '../types.js';
import type {
  LLMProvider,
  LLMMessage,
  LLMTextBlock,
  LLMToolUseBlock,
  LLMTool,
} from './providers/types.js';

const isTextBlock = (b: LLMTextBlock | LLMToolUseBlock): b is LLMTextBlock => b.type === 'text';
const isToolUseBlock = (b: LLMTextBlock | LLMToolUseBlock): b is LLMToolUseBlock =>
  b.type === 'tool_use';

export class Agent {
  private readonly provider: LLMProvider;
  private readonly model: string;
  private readonly systemPrompt: string;
  private readonly tools: AgentTool[];
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly maxIterations: number;

  constructor(provider: LLMProvider, config: AgentConfig) {
    this.provider = provider;
    this.model = config.model;
    this.systemPrompt = config.systemPrompt;
    this.tools = config.tools ?? [];
    this.temperature = config.temperature ?? 1;
    this.maxTokens = config.maxTokens ?? 2048;
    this.maxIterations = config.maxIterations ?? 6;
  }

  /**
   * Esegue il task fino a una risposta finale e restituisce un AgentResult.
   * Non lancia mai: ogni errore viene catturato e riportato in `success/error`,
   * cosi' il fallimento di un agente non fa cadere l'intero swarm.
   */
  async run(
    agentId: string,
    task: string,
    onProgress?: (event: SwarmProgressEvent) => void,
  ): Promise<AgentResult> {
    const started = Date.now();
    const trace: TraceStep[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let iterations = 0;

    // Lookup veloce dei tool per nome + definizioni nel formato LLM normalizzato.
    const toolMap = new Map(this.tools.map((t) => [t.name, t]));
    const toolDefs: LLMTool[] = this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    const messages: LLMMessage[] = [{ role: 'user', content: task }];

    try {
      while (iterations < this.maxIterations) {
        iterations++;
        onProgress?.({ type: 'agent_iteration', agentId, iteration: iterations });
        const response = await this.provider.chat({
          model: this.model,
          system: this.systemPrompt,
          messages,
          tools: toolDefs,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
        });
        inputTokens += response.usage.input_tokens;
        outputTokens += response.usage.output_tokens;

        // Registra eventuale testo/ragionamento prodotto in questo giro.
        for (const block of response.content) {
          if (isTextBlock(block) && block.text.trim()) {
            trace.push({ iteration: iterations, type: 'thinking', content: block.text });
            // In modalità verbose emette il ragionamento prima di una tool call.
            if (response.stop_reason === 'tool_use') {
              onProgress?.({ type: 'agent_thinking', agentId, iteration: iterations, text: block.text });
            }
          }
        }

        // Caso terminale: il modello non chiede tool -> e' la risposta finale.
        if (response.stop_reason !== 'tool_use') {
          const finalText = response.content
            .filter(isTextBlock)
            .map((b) => b.text)
            .join('\n')
            .trim();
          trace.push({ iteration: iterations, type: 'final', content: finalText });
          return {
            model: this.model,
            agentId,
            output: finalText,
            trace,
            success: true,
            iterations,
            inputTokens,
            outputTokens,
            durationMs: Date.now() - started,
          };
        }

        // Il modello ha richiesto una o piu' tool call: vanno eseguite.
        // Prima si reinserisce il messaggio dell'assistant (contiene i blocchi tool_use).
        messages.push({ role: 'assistant', content: response.content });

        const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = [];
        for (const block of response.content) {
          if (!isToolUseBlock(block)) continue;

          onProgress?.({ type: 'agent_tool_call', agentId, iteration: iterations, toolName: block.name, input: block.input as Record<string, unknown> });
          trace.push({
            iteration: iterations,
            type: 'tool_call',
            toolName: block.name,
            content: JSON.stringify(block.input),
          });

          const tool = toolMap.get(block.name);
          let resultText: string;
          let isError = false;

          if (!tool) {
            resultText = `Errore: tool sconosciuto "${block.name}".`;
            isError = true;
          } else {
            try {
              resultText = await tool.execute(block.input as Record<string, unknown>);
            } catch (e) {
              resultText = `Errore durante l'esecuzione del tool: ${(e as Error).message}`;
              isError = true;
            }
          }

          onProgress?.({ type: 'agent_tool_result', agentId, iteration: iterations, toolName: block.name, result: resultText, isError });
          trace.push({
            iteration: iterations,
            type: 'tool_result',
            toolName: block.name,
            content: resultText,
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: resultText,
            is_error: isError,
          });
        }

        // Le observation tornano al modello come messaggio user nel giro successivo.
        messages.push({ role: 'user', content: toolResults });
      }

      // Uscita per superamento del tetto di iterazioni: e' un fallimento controllato.
      const lastThought =
        [...trace].reverse().find((s) => s.type === 'thinking')?.content ?? '';
      return {
        model: this.model,
        agentId,
        output: lastThought,
        trace,
        success: false,
        error: `Raggiunto il limite di iterazioni (${this.maxIterations}).`,
        iterations,
        inputTokens,
        outputTokens,
        durationMs: Date.now() - started,
      };
    } catch (e) {
      return {
        model: this.model,
        agentId,
        output: '',
        trace,
        success: false,
        error: (e as Error).message,
        iterations,
        inputTokens,
        outputTokens,
        durationMs: Date.now() - started,
      };
    }
  }
}
