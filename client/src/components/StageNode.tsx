import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { SerializableStageConfig } from '../types.js';

const TYPE_CONFIG: Record<
  SerializableStageConfig['type'],
  { label: string; indicator: string; text: string; ring: string }
> = {
  swarm: {
    label: 'SWARM',
    indicator: 'bg-violet-500',
    text: 'text-violet-400',
    ring: 'ring-violet-500/40',
  },
  agent: {
    label: 'AGENT',
    indicator: 'bg-sky-500',
    text: 'text-sky-400',
    ring: 'ring-sky-500/40',
  },
  transform: {
    label: 'TRANSFORM',
    indicator: 'bg-emerald-500',
    text: 'text-emerald-400',
    ring: 'ring-emerald-500/40',
  },
  action: {
    label: 'ACTION',
    indicator: 'bg-amber-500',
    text: 'text-amber-400',
    ring: 'ring-amber-500/40',
  },
};

export interface StageNodeData {
  stage: SerializableStageConfig;
  selected: boolean;
  onDelete: (id: string) => void;
}

export function StageNode({ data }: NodeProps) {
  const { stage, selected, onDelete } = data as unknown as StageNodeData;
  const cfg = TYPE_CONFIG[stage.type];

  return (
    <div
      className={`group relative flex items-stretch min-w-[168px] rounded-xl shadow-xl transition-all duration-150 ${
        selected
          ? `ring-2 ${cfg.ring} bg-zinc-800 border border-transparent`
          : 'bg-zinc-900 border border-zinc-700/60 hover:border-zinc-600 hover:bg-zinc-800/60'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !border-2 !border-zinc-600 !bg-zinc-900 !-left-1.5"
      />

      {/* Left color bar */}
      <div className={`w-[3px] rounded-l-xl ${cfg.indicator} flex-shrink-0`} />

      <div className="flex-1 px-3 py-2.5 min-w-0">
        <div className={`text-[9px] font-bold tracking-[0.12em] uppercase font-mono mb-1 ${cfg.text}`}>
          {cfg.label}
        </div>
        <div className="text-[13px] font-semibold text-zinc-100 truncate leading-tight">
          {stage.name}
        </div>
      </div>

      {/* Delete button — shown on hover */}
      <button
        className="nodrag absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all text-[11px] shadow-sm"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(stage.id);
        }}
        title="Rimuovi stage"
      >
        ×
      </button>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !border-2 !border-zinc-600 !bg-zinc-900 !-right-1.5"
      />
    </div>
  );
}
