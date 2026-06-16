export interface TaskParsed {
  taskId: string;
  name: string;
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  deps: string[];
}

export function parseWbsTasks(wbs: string): TaskParsed[] {
  const blocks = wbs.split(/(?=^TASK-\d+:)/mi).filter((b) => /^TASK-\d+:/i.test(b.trim()));
  return blocks.map((block) => {
    const header = block.match(/^TASK-(\d+):\s*(.+)/im)!;
    const taskId = header[1]!;
    const name = header[2]!.trim();

    const prioRaw = block.match(/priorit[aà][^:]*:\s*(\w+)/i)?.[1]?.toLowerCase() ?? 'media';
    const priority: TaskParsed['priority'] =
      prioRaw === 'alta'    ? 'high'   :
      prioRaw === 'bassa'   ? 'low'    :
      prioRaw === 'urgente' ? 'urgent' :
      'medium';

    const depsRaw = block.match(/dipendenze[^:]*:\s*(.+)/i)?.[1] ?? '';
    const deps: string[] = [];
    if (!/nessuna/i.test(depsRaw)) {
      for (const m of depsRaw.matchAll(/TASK-(\d+)/gi)) deps.push(m[1]!);
    }

    return { taskId, name, priority, deps };
  });
}

export function deriveProjectIdentity(scopeOutput: string): { name: string; identifier: string } {
  const nameMatch      = scopeOutput.match(/nome progetto[^:\n]*:\*{0,2}\s*\*{0,2}\s*([^\n]{3,60})/i);
  const objectiveMatch = scopeOutput.match(/obiettivo[^:\n]*:?\*{0,2}\s*\n?\s*([^\n*#\d][^\n]{5,})/i);
  const raw =
    nameMatch?.[1]?.trim() ??
    objectiveMatch?.[1]?.trim() ??
    scopeOutput.split('\n').find((l) => l.trim() && !/^[#*\d]/.test(l.trim()))?.trim() ??
    'Progetto';

  const name       = raw.replace(/[^\w\s\-.,()]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50);
  const base       = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'PROJ';
  const suffix     = Math.random().toString(36).slice(2, 4).toUpperCase();
  const identifier = (base + suffix).slice(0, 10);
  return { name, identifier };
}
