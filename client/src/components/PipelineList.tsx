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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#111',
        borderRight: '1px solid #2a2a2a',
      }}
    >
      <div
        style={{
          padding: '12px 12px 8px',
          borderBottom: '1px solid #2a2a2a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
          PIPELINE
        </span>
        <button
          onClick={onNew}
          style={{
            background: '#1e6feb',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            fontSize: 11,
            padding: '3px 8px',
            cursor: 'pointer',
          }}
        >
          + Nuova
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {summaries.length === 0 && (
          <div style={{ padding: 16, color: '#555', fontSize: 12 }}>
            Nessuna pipeline salvata.
          </div>
        )}
        {summaries.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{
              padding: '10px 12px',
              cursor: 'pointer',
              borderBottom: '1px solid #1a1a1a',
              background: s.id === currentId ? '#1a2a3a' : 'transparent',
              position: 'relative',
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: s.id === currentId ? '#7db9e8' : '#ccc',
                fontWeight: s.id === currentId ? 600 : 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                paddingRight: 24,
              }}
            >
              {s.name}
            </div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
              {s.stageCount} stage{s.stageCount !== 1 ? 's' : ''}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s.id);
              }}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#555',
                fontSize: 14,
                cursor: 'pointer',
                padding: 2,
              }}
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
