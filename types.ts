/**
 * types.ts
 * --------
 * Il "contratto" condiviso da tutti i moduli. Definire i tipi per primi
 * costringe a ragionare sui confini tra componenti: cosa produce un agente,
 * cosa si aspetta un aggregatore, com'e' fatta la configurazione di uno swarm.
 */

/* ----------------------------------------------------------------------------
 * TOOL
 * Uno strumento che l'agente puo' invocare durante il suo ragionamento.
 * `input_schema` e' un JSON Schema che descrive gli argomenti; `execute` e'
 * la funzione (sincrona o asincrona) che esegue realmente l'azione.
 * -------------------------------------------------------------------------- */
export interface JSONSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface AgentTool {
  name: string;
  description: string;
  input_schema: JSONSchema;
  execute: (input: Record<string, unknown>) => Promise<string> | string;
}

/* ----------------------------------------------------------------------------
 * CONFIGURAZIONE DEL SINGOLO AGENTE
 * Tutti i worker dello swarm condividono questa stessa configurazione.
 * -------------------------------------------------------------------------- */
export interface AgentConfig {
  /** Identificatore del modello, es. "claude-haiku-4-5". */
  model: string;
  /** System prompt che definisce ruolo e comportamento del worker. */
  systemPrompt: string;
  /** Strumenti a disposizione dell'agente (opzionali). */
  tools?: AgentTool[];
  /** 0 = deterministico, 1 = massima diversita'. La diversita' alimenta il voto. */
  temperature?: number;
  /** Tetto ai token di output per ogni chiamata al modello. */
  maxTokens?: number;
  /** Tetto di sicurezza al numero di cicli del loop ReAct. */
  maxIterations?: number;
}

/* ----------------------------------------------------------------------------
 * TRACCIA DI ESECUZIONE
 * Ogni passo del ragionamento dell'agente viene registrato: utile per il
 * debug, l'audit e per capire perche' due agenti hanno risposto diversamente.
 * -------------------------------------------------------------------------- */
export type TraceStepType = 'thinking' | 'tool_call' | 'tool_result' | 'final';

export interface TraceStep {
  iteration: number;
  type: TraceStepType;
  content: string;
  toolName?: string;
}

/* ----------------------------------------------------------------------------
 * RISULTATO DI UN SINGOLO AGENTE
 * -------------------------------------------------------------------------- */
export interface AgentResult {
  agentId: string;
  /** Risposta testuale finale dell'agente. */
  output: string;
  /** Sequenza completa di ragionamento + tool call. */
  trace: TraceStep[];
  success: boolean;
  error?: string;
  iterations: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

/* ----------------------------------------------------------------------------
 * AGGREGAZIONE
 * L'esito della fase in cui le N risposte vengono ridotte a una sola.
 * -------------------------------------------------------------------------- */
export interface AggregationResult {
  /** La risposta finale scelta o sintetizzata. */
  output: string;
  /** Nome della strategia usata (es. "majority_vote", "llm_judge"). */
  strategy: string;
  /** Stima di affidabilita' del risultato, 0..1. */
  confidence: number;
  /** Motivazione (popolata dal giudice LLM). */
  rationale?: string;
  /** Conteggio dei voti per risposta normalizzata (popolato dal voto di maggioranza). */
  votes?: Record<string, number>;
}

/**
 * Ogni strategia di aggregazione implementa questa interfaccia.
 * Riceve il task originale (puo' servire al giudice) e tutti i risultati.
 */
export interface Aggregator {
  readonly name: string;
  aggregate(task: string, results: AgentResult[]): Promise<AggregationResult>;
}

/* ----------------------------------------------------------------------------
 * CONFIGURAZIONE E RISULTATO DELLO SWARM
 * -------------------------------------------------------------------------- */
/**
 * Evento emesso dallo swarm durante l'esecuzione. Usato da `SwarmConfig.onProgress`
 * per osservare lo stato degli agenti in tempo reale.
 * Usa `consoleSwarmLogger()` per una implementazione pronta all'uso.
 *
 * Eventi per modalità verbose (ragionamento e I/O degli strumenti):
 *   agent_thinking     — testo di ragionamento prima di una tool call
 *   agent_tool_result  — output di un tool dopo l'esecuzione
 */
export type SwarmProgressEvent =
  | { type: 'swarm_start'; task: string; size: number; concurrency: number }
  | { type: 'agent_start'; agentId: string }
  | { type: 'agent_iteration'; agentId: string; iteration: number }
  | { type: 'agent_thinking'; agentId: string; iteration: number; text: string }
  | { type: 'agent_tool_call'; agentId: string; iteration: number; toolName: string; input: Record<string, unknown> }
  | { type: 'agent_tool_result'; agentId: string; iteration: number; toolName: string; result: string; isError: boolean }
  | { type: 'agent_done'; agentId: string; success: boolean; durationMs: number; iterations: number; output?: string; error?: string }
  | { type: 'aggregating'; strategy: string; candidateCount: number }
  | { type: 'swarm_done'; succeeded: number; total: number; wallClockMs: number };

export interface SwarmConfig {
  /** Numero di agenti worker da lanciare. */
  size: number;
  /** Configurazione condivisa da tutti i worker. */
  agent: AgentConfig;
  /** Come combinare i risultati dei worker. */
  aggregator: Aggregator;
  /** Numero massimo di agenti eseguiti contemporaneamente. Default: `size`. */
  concurrency?: number;
  /** Se impostato, lo swarm fallisce sotto questa soglia di agenti riusciti. */
  minSuccesses?: number;
  /**
   * Callback invocata ad ogni evento significativo dell'esecuzione.
   * Permette di monitorare lo stato degli agenti in tempo reale.
   * Usa `consoleSwarmLogger()` per loggare su stderr senza configurazione.
   */
  onProgress?: (event: SwarmProgressEvent) => void;
}

export interface SwarmStats {
  total: number;
  succeeded: number;
  failed: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Tempo reale trascorso: con esecuzione parallela e' molto minore della somma. */
  wallClockMs: number;
}

export interface SwarmResult {
  task: string;
  final: AggregationResult;
  candidates: AgentResult[];
  stats: SwarmStats;
}
