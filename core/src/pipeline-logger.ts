/**
 * pipeline-logger.ts
 * ------------------
 * UI interattiva per monitorare l'esecuzione della pipeline su stderr.
 *
 * Funzionalità:
 *  - Box doppio ╔╗╚╝ per pipeline start/end (distinto dal box swarm ┌┐└┘)
 *  - Box singolo per ogni stage con nome, tipo e indice
 *  - Delega gli eventi interni (stage_event) a istanze SwarmConsole per-stage
 *  - Ogni stage ha il proprio spinner e stato colori indipendente
 *
 * Utilizzo:
 *   new Pipeline(provider, { onProgress: consolePipelineLogger() });
 *   new Pipeline(provider, { onProgress: consolePipelineLogger({ verbose: true }) });
 */
import type { PipelineProgressEvent, SwarmProgressEvent } from '../types.js';
import { consoleSwarmLogger, type ConsoleSwarmLoggerOptions } from './logger.js';
import { R, B, D, RED, GREEN, YELLOW, BLUE, CYAN, GRAY, stripAnsi } from './ansi.js';

// ── Opzioni pubbliche ─────────────────────────────────────────────────────────

export interface ConsolePipelineLoggerOptions extends ConsoleSwarmLoggerOptions {
  /**
   * Se true (default), mostra gli eventi interni degli swarm/agenti per ogni stage.
   * Se false, mostra solo i box di pipeline e stage senza dettaglio.
   */
  showInternalEvents?: boolean;
}

// ── Classe principale ─────────────────────────────────────────────────────────

class PipelineConsole {
  private readonly out = process.stderr;
  private readonly showInternalEvents: boolean;
  private readonly showTs: boolean;
  private readonly swarmLoggerOpts: ConsoleSwarmLoggerOptions;

  /**
   * Un'istanza consoleSwarmLogger per ogni stage attivo.
   * Creata su stage_start, rimossa su stage_done.
   * Questo garantisce stato spinner e colori agenti indipendenti per stage.
   */
  private readonly stageLoggers = new Map<string, (event: SwarmProgressEvent) => void>();

  private pipelineStart = 0;
  private totalStages = 0;

  constructor(opts: ConsolePipelineLoggerOptions) {
    this.showInternalEvents = opts.showInternalEvents ?? true;
    this.showTs = opts.timestamps ?? true;
    this.swarmLoggerOpts = { verbose: opts.verbose, timestamps: opts.timestamps };
  }

  private cols(): number { return (this.out as NodeJS.WriteStream).columns ?? 100; }

  private ts(): string {
    return `${GRAY}${new Date().toISOString().slice(11, 19)}${R}`;
  }

  private pre(): string { return this.showTs ? `  ${this.ts()}  ` : '  '; }

  private print(line: string): void { this.out.write(`${line}\n`); }

  private stageIcon(type: string): string {
    switch (type) {
      case 'swarm':     return `${CYAN}⟳${R}`;
      case 'agent':     return `${BLUE}▸${R}`;
      case 'transform': return `${YELLOW}⟴${R}`;
      default:          return '•';
    }
  }

  private stageLabel(type: string): string {
    switch (type) {
      case 'swarm':     return `${CYAN}swarm${R}`;
      case 'agent':     return `${BLUE}agent${R}`;
      case 'transform': return `${YELLOW}transform${R}`;
      default:          return type;
    }
  }

  handle(ev: PipelineProgressEvent): void {
    const w = this.cols();

    switch (ev.type) {

      // ── Inizio pipeline ───────────────────────────────────────────────────
      case 'pipeline_start': {
        this.pipelineStart = Date.now();
        this.totalStages = ev.totalStages;
        const meta    = `${B}PIPELINE${R}  ${D}${ev.totalStages} stage${R}`;
        const metaLen = stripAnsi(meta).length;
        const fill    = Math.max(0, w - metaLen - 8);
        const task    = ev.task.length > w - 6 ? ev.task.slice(0, w - 9) + '…' : ev.task;
        this.out.write('\n');
        this.out.write(`${B}╔═  ${meta}  ${'═'.repeat(fill)}═╗${R}\n`);
        this.out.write(`${B}║${R}  ${D}${task}${R}\n`);
        this.out.write(`${B}╚${'═'.repeat(w - 2)}╝${R}\n\n`);
        break;
      }

      // ── Inizio stage ──────────────────────────────────────────────────────
      case 'stage_start': {
        const icon  = this.stageIcon(ev.stageType);
        const label = this.stageLabel(ev.stageType);
        const idx   = `${D}[${ev.stageIndex + 1}/${this.totalStages}]${R}`;
        const task  = ev.task.length > w - 22 ? ev.task.slice(0, w - 25) + '…' : ev.task;
        this.out.write('\n');
        this.print(`${B}┌── ${ev.stageName}${R}  ${idx}  ${icon} ${label}`);
        this.print(`${B}│${R}  ${D}${task}${R}`);
        this.print(`${B}└${'─'.repeat(w - 2)}${R}`);
        this.out.write('\n');

        // Crea logger swarm dedicato per questo stage
        if (this.showInternalEvents) {
          this.stageLoggers.set(ev.stageName, consoleSwarmLogger(this.swarmLoggerOpts));
        }
        break;
      }

      // ── Evento interno (swarm o agent) ────────────────────────────────────
      case 'stage_event': {
        if (!this.showInternalEvents) break;
        this.stageLoggers.get(ev.stageName)?.(ev.event);
        break;
      }

      // ── Stage completato ──────────────────────────────────────────────────
      case 'stage_done': {
        this.stageLoggers.delete(ev.stageName);
        const dur    = (ev.durationMs / 1000).toFixed(1);
        const status = ev.success
          ? `${GREEN}${B}✓${R}  ${ev.stageName}  ${GREEN}completato${R}  ${D}${dur}s${R}`
          : `${RED}${B}✗${R}  ${ev.stageName}  ${RED}fallito${R}  ${D}${ev.error ?? 'errore sconosciuto'}${R}`;
        this.out.write('\n');
        this.print(`${this.pre()}${status}`);
        break;
      }

      // ── Errore di pipeline ────────────────────────────────────────────────
      case 'pipeline_error': {
        this.print(
          `${this.pre()}${RED}${B}! PIPELINE ERROR${R}  ` +
          `${D}stage: ${ev.stageName}${R}  ${RED}${ev.error}${R}`,
        );
        break;
      }

      // ── Fine pipeline ─────────────────────────────────────────────────────
      case 'pipeline_done': {
        const totalDur = ((Date.now() - this.pipelineStart) / 1000).toFixed(1);
        const allOk   = ev.succeededStages === ev.totalStages;
        const color   = allOk ? GREEN : YELLOW;
        const status  = `${B}${ev.succeededStages}/${ev.totalStages} stage ok${R}`;
        const meta    = `${color}${status}${R}  ·  ${color}${totalDur}s${R}`;
        const metaLen = stripAnsi(meta).length;
        const fill    = Math.max(0, w - metaLen - 8);
        this.out.write('\n');
        this.out.write(`${color}${B}╔═  ${meta}  ${'═'.repeat(fill)}═╗${R}\n`);
        this.out.write(`${color}${B}╚${'═'.repeat(w - 2)}╝${R}\n\n`);
        break;
      }
    }
  }
}

// ── Esportazione pubblica ─────────────────────────────────────────────────────

/**
 * Crea un handler `onProgress` per Pipeline con UI interattiva su stderr.
 *
 * Gli eventi interni degli stage (swarm/agent) vengono delegati automaticamente
 * a istanze `consoleSwarmLogger` indipendenti, una per stage.
 *
 * @example
 * new Pipeline(provider, { onProgress: consolePipelineLogger() });
 *
 * @example
 * // Verbose: mostra ragionamento e tool I/O degli agenti
 * new Pipeline(provider, { onProgress: consolePipelineLogger({ verbose: true }) });
 *
 * @example
 * // Solo box di pipeline e stage, niente dettaglio interno
 * new Pipeline(provider, { onProgress: consolePipelineLogger({ showInternalEvents: false }) });
 */
export function consolePipelineLogger(
  opts: ConsolePipelineLoggerOptions = {},
): (event: PipelineProgressEvent) => void {
  const ui = new PipelineConsole(opts);
  return (ev) => ui.handle(ev);
}
