import type { PipelineSummary } from '../types.js';

interface Props {
  summaries: PipelineSummary[];
  currentId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function PipelineList({ summaries, currentId, onSelect, onNew, onDelete }: Props) {
  return (
    <div className="flex flex-col h-full bg-zinc-900 border-r border-zinc-800">
      <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-800 flex-shrink-0">
        <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
          Pipelines
        </span>
        <button
          onClick={onNew}
          className="text-xs bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg px-2.5 py-1 font-semibold transition-colors"
        >
          + Nuova
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {summaries.length === 0 && (
          <div className="px-4 py-8 text-center text-zinc-600 text-xs leading-relaxed">
            Nessuna pipeline.<br />
            <span className="text-zinc-700">Creane una nuova.</span>
          </div>
        )}
        {summaries.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`group relative px-3 py-2.5 cursor-pointer border-b border-zinc-800/40 transition-all ${
              s.id === currentId
                ? 'bg-blue-500/10 border-l-2 border-l-blue-500'
                : 'hover:bg-zinc-800/60 border-l-2 border-l-transparent'
            }`}
          >
            <div
              className={`text-[13px] truncate pr-6 leading-snug font-medium ${
                s.id === currentId ? 'text-blue-300' : 'text-zinc-300'
              }`}
            >
              {s.name}
            </div>
            <div className="text-[10px] text-zinc-600 mt-0.5">
              {s.stageCount} stage{s.stageCount !== 1 ? 's' : ''}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s.id);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all text-sm"
              title="Elimina"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
