import type { PlaneToolsConfig } from '../../../agent-tools/plane/plane-tools.js';
import type { GithubToolsConfig } from '../../../agent-tools/github/github-tools.js';
import type { TaskParsed } from '../utils/wbs.js';

/** Provider di board supportati. Aggiungere qui per estendere. */
export type BoardKind = 'plane' | 'github';

/**
 * Config discriminata per selezionare e configurare il board provider.
 * Per aggiungere un provider: nuova variante qui + classe in questa cartella + caso nel factory.
 */
export type BoardConfig =
  | { provider: 'plane'; config: PlaneToolsConfig }
  | { provider: 'github'; config: GithubToolsConfig };

export interface BoardProjectRef {
  /** ID (Plane) o nome repo (GitHub) usato per le operazioni successive. */
  projectId: string;
  projectName: string;
}

export interface BoardIssueRef {
  /** ID (Plane) o number come stringa (GitHub). */
  id: string;
  name: string;
}

export interface CreateIssueInput {
  taskId: string;
  name: string;
  priority: TaskParsed['priority'];
}

export interface CreateReportInput {
  title: string;
  /** Contenuto del report in Markdown. Ogni provider lo converte nel formato nativo. */
  markdown: string;
  /** Testo estratto dai PDF allegato in coda al report (opzionale). */
  attachmentText?: string;
}

/**
 * Astrazione delle operazioni di board usate dalla pipeline pm-ai.
 * Ogni provider (Plane, GitHub, ...) le implementa con i propri tool sottostanti.
 */
export interface BoardProvider {
  readonly kind: BoardKind;
  createProject(input: { name: string; identifier: string }): Promise<BoardProjectRef>;
  /** Ritorna null se la issue non e stata creata (errore non bloccante). */
  createIssue(project: BoardProjectRef, input: CreateIssueInput): Promise<BoardIssueRef | null>;
  /** Marca issueId come bloccata dalle issue in blockerIds. */
  linkBlockedBy(project: BoardProjectRef, issueId: string, blockerIds: string[]): Promise<void>;
  /** Crea la pagina/documento di report. Ritorna l'output grezzo del tool. */
  createReportPage(project: BoardProjectRef, input: CreateReportInput): Promise<string>;
}
