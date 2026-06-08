/**
 * agent.ts
 * --------
 * Un singolo agente autonomo. Esegue il loop ReAct (Reason + Act):
 *
 *   1. chiama il modello con il task e gli strumenti disponibili;
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
import Anthropic from '@anthropic-ai/sdk';
import type { AgentConfig, AgentResult, AgentTool, TraceStep } from '../types.js';

const isTextBlock = (b: Anthropic.ContentBlock): b is Anthropic.TextBlock =>
  b.type === 'text';
const isToolUseBlock = (b: Anthropic.ContentBlock): b is Anthropic.ToolUseBlock =>
  b.type === 'tool_use';

export class Agent {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly systemPrompt: string;
  private readonly tools: AgentTool[];
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly maxIterations: number;

  constructor(client: Anthropic, config: AgentConfig) {
    this.client = client;
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
  async run(agentId: string, task: string): Promise<AgentResult> {
    const started = Date.now();
    const trace: TraceStep[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let iterations = 0;

    // Lookup veloce dei tool per nome + definizioni nel formato richiesto dall'API.
    const toolMap = new Map(this.tools.map((t) => [t.name, t]));
    const toolDefs: Anthropic.Tool[] = this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    }));

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: task }];

    try {
      while (iterations < this.maxIterations) {
        iterations++;
        const response = await this.callModel(messages, toolDefs);
        inputTokens += response.usage.input_tokens;
        outputTokens += response.usage.output_tokens;

        // Registra eventuale testo/ragionamento prodotto in questo giro.
        for (const block of response.content) {
          if (isTextBlock(block) && block.text.trim()) {
            trace.push({ iteration: iterations, type: 'thinking', content: block.text });
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

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (!isToolUseBlock(block)) continue;

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

  /**
   * Chiamata al modello con retry ed exponential backoff sui soli errori
   * transitori (429 = rate limit, 5xx = errore server). Gli errori 4xx diversi
   * dal 429 (es. richiesta malformata) non sono ritentati: fallirebbero di nuovo.
   */
  private async callModel(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    attempt = 0,
  ): Promise<Anthropic.Message> {
    const maxAttempts = 4;
    try {
      return await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: this.systemPrompt,
        messages,
        ...(tools.length > 0 ? { tools } : {}),
      });
    } catch (e) {
      const status = (e as { status?: number }).status;
      const retriable = status === 429 || (status !== undefined && status >= 500);
      if (retriable && attempt < maxAttempts) {
        // Backoff: 1s, 2s, 4s, 8s (+ jitter casuale per evitare il "thundering herd").
        const delay = Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 250;
        await new Promise((r) => setTimeout(r, delay));
        return this.callModel(messages, tools, attempt + 1);
      }
      throw e;
    }
  }
}
