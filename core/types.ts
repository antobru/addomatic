/**
 * types.ts
 * --------
 * Il "contratto" condiviso da tutti i moduli. Definire i tipi per primi
 * costringe a ragionare sui confini tra componenti: cosa produce un agente,
 * cosa si aspetta un aggregatore, com'e' fatta la configurazione di uno swarm.
 */
import type { LLMProvider } from './src/providers/types.js';

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
 * WORKER CONFIG (eterogeneo)
 * Configurazione per un singolo worker in uno swarm eterogeneo.
 * `provider` sovrascrive il provider globale dello swarm per questo worker.
 * -------------------------------------------------------------------------- */
export interface AgentWorkerConfig {
  /** Label visibile nei log: "opus-worker", "haiku-fast-1", ecc. Default: "agent-N". */
  id?: string;
  agent: AgentConfig;
  /** Provider da usare per questo specifico worker (sovrascrive quello globale). */
  provider?: LLMProvider;
}

/* ----------------------------------------------------------------------------
 * CONFIGURAZIONE DEL SINGOLO AGENTE
 * Tutti i worker dello swarm condividono questa stessa configurazione.
 * -------------------------------------------------------------------------- */
export interface AgentConfig {
  provider?: LLMProvider;
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
  /** Modello usato da questo agente — utile con swarm eterogenei per vedere quale ha vinto. */
  model: string;
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

type SwarmConfigBase = {
  /** Come combinare i risultati dei worker. */
  aggregator: Aggregator;
  /** Numero massimo di agenti eseguiti contemporaneamente. Default: numero di worker. */
  concurrency?: number;
  /** Se impostato, lo swarm fallisce sotto questa soglia di agenti riusciti. */
  minSuccesses?: number;
  /**
   * Callback invocata ad ogni evento significativo dell'esecuzione.
   * Permette di monitorare lo stato degli agenti in tempo reale.
   * Usa `consoleSwarmLogger()` per loggare su stderr senza configurazione.
   */
  onProgress?: (event: SwarmProgressEvent) => void;
};

/**
 * Configurazione dello swarm.
 *
 * **Modalità omogenea** — N copie identiche dello stesso agente:
 * ```ts
 * { size: 5, agent: { model: 'claude-haiku-4-5', ... }, aggregator: ... }
 * ```
 *
 * **Modalità eterogenea** — ogni worker ha il suo `AgentConfig` e provider opzionale:
 * ```ts
 * { workers: [
 *     { id: 'opus',   agent: { model: 'claude-opus-4-8', temperature: 0.2, ... } },
 *     { id: 'haiku',  agent: { model: 'claude-haiku-4-5', temperature: 0.9, ... } },
 *     { id: 'local',  agent: { model: 'llama3.1', ... }, provider: ollamaProvider() },
 *   ], aggregator: ...
 * }
 * ```
 */
export type SwarmConfig = SwarmConfigBase & (
  | { size: number; agent: AgentConfig; workers?: never }
  | { workers: AgentWorkerConfig[]; size?: never; agent?: never }
);

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

/* ============================================================================
 * PIPELINE — Tipi pubblici
 *
 * Un layer sequenziale sopra Swarm/Agent: ogni stage riceve l'output del
 * precedente tramite PipelineContext e può costruire il task dinamicamente.
 * ============================================================================ */

/** Risultato di uno stage, accumulato nel PipelineContext per gli stage successivi. */
export interface StageResult {
  stageName: string;
  /** Task effettivo passato allo stage (già risolto se era una funzione). */
  task: string;
  /** Output testuale principale prodotto dallo stage. */
  output: string;
  success: boolean;
  error?: string;
  swarmResult?: SwarmResult;
  agentResult?: AgentResult;
  durationMs: number;
}

/** Passato ad ogni stage per costruire task dinamici sui risultati precedenti. */
export interface PipelineContext {
  originalTask: string;
  /** Risultati di tutti gli stage precedenti, indicizzati per nome. */
  stages: Record<string, StageResult>;
  /** Shortcut: risultato dell'ultimo stage eseguito. Null per il primo stage. */
  previous: StageResult | null;
  /** Variabili fornite all'avvio della pipeline, accessibili in template e codice. */
  vars: Record<string, string>;
}

/** Task risolto: stringa statica oppure funzione che legge il context. */
export type TaskResolver = string | ((ctx: PipelineContext) => string);

/** Stage che esegue uno Swarm (fan-out parallelo + aggregazione). */
export interface SwarmStageConfig {
  type: 'swarm';
  name: string;
  /** Se omesso, il task è `ctx.previous?.output ?? originalTask`. */
  task?: TaskResolver;
  /** onProgress è escluso: la pipeline lo inietta internamente. */
  swarmConfig: Omit<SwarmConfig, 'onProgress'>;
  /** Provider LLM per questo stage. Sovrascrive il provider globale della pipeline. */
  provider?: LLMProvider;
}

/** Stage che esegue un singolo Agent (più leggero, nessuna aggregazione). */
export interface AgentStageConfig {
  type: 'agent';
  name: string;
  task?: TaskResolver;
  agentConfig: AgentConfig;
  /** ID da passare all'agente. Default: nome dello stage. */
  agentId?: string;
  /** Provider LLM per questo stage. Sovrascrive il provider globale della pipeline. */
  provider?: LLMProvider;
}

/** Stage che esegue una funzione TypeScript pura, senza chiamate LLM. */
export interface TransformStageConfig {
  type: 'transform';
  name: string;
  /** Riceve il context completo, restituisce l'output. Può essere async. */
  transform: (ctx: PipelineContext) => string | Promise<string>;
}

/** Stage che esegue codice arbitrario con possibili side-effect (chiamate API, I/O, ecc.). */
export interface ActionStageConfig {
  type: 'action';
  name: string;
  /** Se omesso, usa `ctx.previous?.output ?? originalTask`. */
  task?: TaskResolver;
  /** Riceve il context completo e il task risolto. Può essere async. */
  execute: (ctx: PipelineContext, resolvedTask: string) => string | Promise<string>;
  /** Timeout in ms. Se superato, lo stage fallisce con errore. Nessun limite per default. */
  timeout?: number;
}

/** Union discriminata di tutti i tipi di stage. */
export type StageConfig = SwarmStageConfig | AgentStageConfig | TransformStageConfig | ActionStageConfig;

export interface PipelineConfig {
  stages: StageConfig[];
  /**
   * Se true (default), la pipeline lancia un'eccezione al primo stage fallito.
   * Se false, marca lo stage come failed e continua.
   */
  stopOnFailure?: boolean;
  onProgress?: (event: PipelineProgressEvent) => void;
}

/**
 * Evento emesso dalla pipeline durante l'esecuzione.
 * `stage_event` wrappa gli `SwarmProgressEvent` interni degli stage swarm/agent,
 * permettendo ai consumer di osservare ogni livello di dettaglio.
 */
export type PipelineProgressEvent =
  | { type: 'pipeline_start'; totalStages: number; task: string }
  | { type: 'stage_start'; stageName: string; stageType: StageConfig['type']; stageIndex: number; task: string }
  | { type: 'stage_event'; stageName: string; event: SwarmProgressEvent }
  | { type: 'stage_done'; stageName: string; stageIndex: number; success: boolean; durationMs: number; output?: string; error?: string }
  | { type: 'pipeline_error'; stageName: string; error: string }
  | { type: 'pipeline_done'; totalStages: number; succeededStages: number; totalDurationMs: number };

export interface PipelineStats {
  totalStages: number;
  succeededStages: number;
  failedStages: number;
  totalDurationMs: number;
}

export interface PipelineResult {
  task: string;
  stages: StageResult[];
  /** Ultimo stage eseguito con successo. Null se nessuno ha avuto successo. */
  final: StageResult | null;
  stats: PipelineStats;
}
