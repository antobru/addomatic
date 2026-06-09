import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { SerializableStageConfig } from '../types.js';

const TYPE_COLORS: Record<SerializableStageConfig['type'], string> = {
  swarm: '#7c3aed',
  agent: '#0891b2',
  transform: '#059669',
  action: '#d97706',
};

const TYPE_LABELS: Record<SerializableStageConfig['type'], string> = {
  swarm: 'SWARM',
  agent: 'AGENT',
  transform: 'TRANSFORM',
  action: 'ACTION',
};

export interface StageNodeData {
  stage: SerializableStageConfig;
  selected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function StageNode({ data }: NodeProps) {
  const { stage, selected, onSelect, onDelete } = data as unknown as StageNodeData;
  const color = TYPE_COLORS[stage.type];

  return (
    <div
      onClick={() => onSelect(stage.id)}
      style={{
        background: '#1e1e1e',
        border: `2px solid ${selected ? '#fff' : color}`,
        borderRadius: 8,
        padding: '8px 14px',
        minWidth: 140,
        cursor: 'pointer',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: color }} />

      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color,
          letterSpacing: 1,
          marginBottom: 4,
          fontFamily: 'monospace',
        }}
      >
        {TYPE_LABELS[stage.type]}
      </div>
      <div
        style={{
          fontSize: 13,
          color: '#e5e5e5',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 160,
        }}
      >
        {stage.name}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(stage.id);
        }}
        style={{
          position: 'absolute',
          top: 4,
          right: 6,
          background: 'none',
          border: 'none',
          color: '#666',
          fontSize: 14,
          cursor: 'pointer',
          lineHeight: 1,
          padding: 0,
        }}
        title="Rimuovi stage"
      >
        ×
      </button>

      <Handle type="source" position={Position.Right} style={{ background: color }} />
    </div>
  );
}
