/**
 * logger.ts
 * ---------
 * UI interattiva per monitorare l'esecuzione dello swarm in tempo reale.
 *
 * Funzionalità:
 *  - Spinner animato con tempo trascorso mentre gli agenti lavorano
 *  - Delta tra un evento e il successivo (+1.4s)
 *  - Colore diverso per ogni agente
 *  - Box di apertura/chiusura con riepilogo
 *  - Modalità verbose: ragionamento dell'agente, input/output dei tool,
 *    risposta finale — tutto visibile appena disponibile
 *
 * Utilizzo:
 *   new Swarm(provider, { onProgress: consoleSwarmLogger() });
 *   new Swarm(provider, { onProgress: consoleSwarmLogger({ verbose: true }) });
 */
import type { SwarmProgressEvent } from '../types.js';
import { R, B, D, RED, GREEN, YELLOW, BLUE, MAGENTA, CYAN, GRAY, CLR, stripAnsi } from './ansi.js';

const SPIN_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
// Un colore diverso per ogni agente — cycling
const AGENT_COLORS = [CYAN, GREEN, YELLOW, MAGENTA, BLUE, `\x1b[96m`];

// ── Opzioni pubbliche ─────────────────────────────────────────────────────────
export interface ConsoleSwarmLoggerOptions {
  /**
   * Modalità verbose: mostra il ragionamento del modello, input e output
   * di ogni tool, risposta finale di ogni agente. Default: false.
   */
  verbose?: boolean;
  /**
   * Mostra il timestamp HH:MM:SS prima di ogni riga. Default: true.
   */
  timestamps?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function ts(): string {
  return `${GRAY}${new Date().toISOString().slice(11, 19)}${R}`;
}

/** Spezza il testo in righe di al massimo `width` caratteri visibili. */
function wrap(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const out: string[] = [];
  for (const para of text.replace(/\r\n/g, '\n').split('\n')) {
    if (!para) { out.push(''); continue; }
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const w = stripAnsi(word).length > width ? word.slice(0, width - 1) + '…' : word;
      if (line && stripAnsi(line).length + 1 + stripAnsi(w).length > width) {
        out.push(line);
        line = w;
      } else {
        line = line ? `${line} ${w}` : w;
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}

// ── Stato per agente ──────────────────────────────────────────────────────────
interface AgentState {
  color: string;
  lastMs: number;
  active: boolean;
}

// ── Classe principale ─────────────────────────────────────────────────────────
class SwarmConsole {
  private readonly out = process.stderr;
  private readonly verbose: boolean;
  private readonly showTs: boolean;

  private agents = new Map<string, AgentState>();
  private colorIdx = 0;

  // spinner
  private spinTimer: ReturnType<typeof setInterval> | null = null;
  private spinFrame = 0;
  private spinText  = '';
  private spinActive = false;
  private spinStart  = 0;

  constructor(opts: ConsoleSwarmLoggerOptions) {
    this.verbose = opts.verbose   ?? false;
    this.showTs  = opts.timestamps ?? true;
  }

  // ── Larghezza terminale ────────────────────────────────────────────────────
  private cols(): number { return this.out.columns ?? 100; }

  // ── Stato agenti ───────────────────────────────────────────────────────────
  private getAgent(id: string): AgentState {
    if (!this.agents.has(id)) {
      this.agents.set(id, {
        color: AGENT_COLORS[this.colorIdx++ % AGENT_COLORS.length]!,
        lastMs: Date.now(),
        active: true,
      });
    }
    return this.agents.get(id)!;
  }

  private activeCount(): number {
    return [...this.agents.values()].filter(a => a.active).length;
  }

  /** Tempo trascorso dall'ultimo evento dello stesso agente, se > 250ms. */
  private delta(id: string): string {
    const now = Date.now();
    const a   = this.agents.get(id);
    if (!a) return '';
    const ms = now - a.lastMs;
    a.lastMs = now;
    if (ms < 250) return '';
    const s = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
    return `  ${D}${GRAY}+${s}${R}`;
  }

  /** Prefisso di ogni riga: spazio + timestamp opzionale. */
  private pre(): string {
    return this.showTs ? `  ${ts()}  ` : '  ';
  }

  // ── Spinner ────────────────────────────────────────────────────────────────
  private drawSpin(): void {
    if (!this.spinActive) return;
    const frame   = SPIN_FRAMES[this.spinFrame % SPIN_FRAMES.length]!;
    const elapsed = ((Date.now() - this.spinStart) / 1000).toFixed(1);
    const left  = `  ${CYAN}${frame}${R}  ${D}${this.spinText}${R}`;
    const right = `${D}${GRAY}${elapsed}s${R}`;
    const gap   = Math.max(1, this.cols() - stripAnsi(left).length - stripAnsi(right).length - 1);
    this.out.write(`${CLR}${left}${' '.repeat(gap)}${right}`);
  }

  private startSpin(text: string): void {
    this.spinText = text;
    if (!this.spinActive) {
      this.spinActive = true;
      this.spinStart  = Date.now();
      this.spinFrame  = 0;
    }
    this.drawSpin();
    if (!this.spinTimer) {
      this.spinTimer = setInterval(() => { this.spinFrame++; this.drawSpin(); }, 80);
      this.spinTimer.unref(); // non blocca l'uscita del processo
    }
  }

  private stopSpin(): void {
    if (this.spinTimer) { clearInterval(this.spinTimer); this.spinTimer = null; }
    if (this.spinActive) { this.out.write(CLR); this.spinActive = false; }
  }

  // ── Stampa ─────────────────────────────────────────────────────────────────
  /** Stampa una riga, gestendo il re-disegno dello spinner. */
  private print(line: string): void {
    if (this.spinActive) {
      this.out.write(`${CLR}${line}\n`);
      this.drawSpin();
    } else {
      this.out.write(`${line}\n`);
    }
  }

  /** Righe di dettaglio indentate con bordo grigio, solo in verbose. */
  private detail(lines: string[], maxLines = 20): void {
    const toShow = lines.slice(0, maxLines);
    for (const l of toShow)
      this.print(`  ${GRAY}┊${R}  ${l}`);
    if (lines.length > maxLines)
      this.print(`  ${GRAY}┊  … +${lines.length - maxLines} righe omesse${R}`);
  }

  // ── Handler eventi ─────────────────────────────────────────────────────────
  handle(ev: SwarmProgressEvent): void {
    const w = this.cols();

    switch (ev.type) {

      // ── Inizio swarm ──────────────────────────────────────────────────────
      case 'swarm_start': {
        const meta = `${B}${ev.size} agenti${R}  ·  concurrency ${ev.concurrency}`;
        const metaLen = stripAnsi(meta).length;
        const fill = Math.max(0, w - metaLen - 8); // "┌─  ─┐" = 4 chars
        const task  = ev.task.length > w - 6 ? ev.task.slice(0, w - 9) + '…' : ev.task;
        this.out.write('\n');
        this.out.write(`${B}┌─  ${meta}  ${'─'.repeat(fill)}─┐${R}\n`);
        this.out.write(`${B}│${R}  ${D}${task}${R}\n`);
        this.out.write(`${B}└${'─'.repeat(w - 2)}┘${R}\n\n`);
        break;
      }

      // ── Agente avviato ────────────────────────────────────────────────────
      case 'agent_start': {
        const a = this.getAgent(ev.agentId);
        this.print(`${this.pre()}${a.color}${B}▶${R}  ${a.color}${ev.agentId}${R}`);
        this.startSpin(`${this.activeCount()} agenti attivi`);
        break;
      }

      // ── Nuova iterazione (chiamata modello) ───────────────────────────────
      case 'agent_iteration': {
        const a = this.getAgent(ev.agentId);
        const d = this.delta(ev.agentId);
        this.print(`${this.pre()}${D}${a.color}◦${R}  ${a.color}${ev.agentId}${R}  ${D}iter ${ev.iteration}  →  modello${R}${d}`);
        this.startSpin(`${this.activeCount()} agenti attivi`);
        break;
      }

      // ── Ragionamento (verbose) ────────────────────────────────────────────
      case 'agent_thinking': {
        if (!this.verbose) break;
        const a     = this.getAgent(ev.agentId);
        const lines = wrap(ev.text.trim(), w - 10);
        this.print(`${this.pre()}${a.color}»${R}  ${a.color}${ev.agentId}${R}  ${D}ragionamento${R}`);
        this.detail(lines.map(l => `${D}${l}${R}`), 15);
        break;
      }

      // ── Tool call ─────────────────────────────────────────────────────────
      case 'agent_tool_call': {
        const a = this.getAgent(ev.agentId);
        const d = this.delta(ev.agentId);
        this.print(`${this.pre()}${YELLOW}⚙${R}  ${a.color}${ev.agentId}${R}  ${YELLOW}${B}${ev.toolName}${R}${d}`);
        if (this.verbose) {
          const raw = JSON.stringify(ev.input);
          const preview = raw.length > w - 16 ? raw.slice(0, w - 19) + '…' : raw;
          this.detail([`${D}input: ${GRAY}${preview}${R}`]);
        }
        break;
      }

      // ── Risultato tool (verbose) ──────────────────────────────────────────
      case 'agent_tool_result': {
        if (!this.verbose) break;
        const a     = this.getAgent(ev.agentId);
        const label = ev.isError ? `${RED}errore${R}` : `${D}risultato${R}`;
        this.print(`${this.pre()}${a.color}←${R}  ${a.color}${ev.agentId}${R}  ${ev.toolName}  ${label}`);
        const lines = wrap(ev.result.trim(), w - 10);
        this.detail(lines.map(l => `${D}${GRAY}${l}${R}`), 10);
        break;
      }

      // ── Agente completato ─────────────────────────────────────────────────
      case 'agent_done': {
        const a = this.getAgent(ev.agentId);
        a.active = false;

        if (ev.success) {
          const dur = (ev.durationMs / 1000).toFixed(1);
          this.print(
            `${this.pre()}${GREEN}✓${R}  ${a.color}${B}${ev.agentId}${R}  ` +
            `${GREEN}completato${R}  ${dur}s  ${D}${ev.iterations} iter${R}`,
          );
          if (this.verbose && ev.output) {
            const lines = wrap(ev.output.trim(), w - 10);
            this.print(`${this.pre()}${D}  risposta finale:${R}`);
            this.detail(lines.map(l => `${D}${l}${R}`), 20);
          }
        } else {
          this.print(
            `${this.pre()}${RED}✗${R}  ${a.color}${B}${ev.agentId}${R}  ` +
            `${RED}fallito${R}  ${D}${ev.error ?? 'errore sconosciuto'}${R}`,
          );
        }

        const remaining = this.activeCount();
        if (remaining > 0) this.startSpin(`${remaining} agenti attivi`);
        else { this.stopSpin(); this.out.write('\n'); }
        break;
      }

      // ── Aggregazione ──────────────────────────────────────────────────────
      case 'aggregating': {
        this.print(
          `${this.pre()}${BLUE}⟳${R}  aggregazione  ` +
          `${B}${ev.strategy}${R}  ${D}${ev.candidateCount} candidati${R}`,
        );
        this.startSpin(`aggregazione con ${ev.strategy}`);
        break;
      }

      // ── Fine swarm ────────────────────────────────────────────────────────
      case 'swarm_done': {
        this.stopSpin();
        const dur    = (ev.wallClockMs / 1000).toFixed(1);
        const allOk  = ev.succeeded === ev.total;
        const color  = allOk ? GREEN : YELLOW;
        const status = `${B}${ev.succeeded}/${ev.total} ok${R}`;
        const meta   = `${color}${status}${R}  ·  ${color}${dur}${R}`;
        const metaLen = stripAnsi(meta).length;
        const fill   = Math.max(0, w - metaLen - 8);
        this.out.write('\n');
        this.out.write(`${color}${B}┌─  ${meta}  ${'─'.repeat(fill)}─┐${R}\n`);
        this.out.write(`${color}${B}└${'─'.repeat(w - 2)}┘${R}\n\n`);
        break;
      }
    }
  }
}

// ── Esportazione pubblica ─────────────────────────────────────────────────────

/**
 * Crea un handler `onProgress` con UI interattiva su stderr.
 *
 * @example
 * // Default: spinner + timing, niente verbose
 * new Swarm(provider, { onProgress: consoleSwarmLogger() });
 *
 * @example
 * // Verbose: ragionamento, input/output tool, risposta finale
 * new Swarm(provider, { onProgress: consoleSwarmLogger({ verbose: true }) });
 */
export function consoleSwarmLogger(opts: ConsoleSwarmLoggerOptions = {}): (event: SwarmProgressEvent) => void {
  const ui = new SwarmConsole(opts);
  return (ev) => ui.handle(ev);
}
