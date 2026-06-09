import { useEffect, useState } from 'react';
import { usePipeline } from './hooks/usePipeline.js';
import { PipelineList } from './components/PipelineList.js';
import { PipelineCanvas } from './components/PipelineCanvas.js';
import { StagePanel } from './components/StagePanel.js';
import type { RunEvent } from './types.js';

function RunLog({ logs }: { logs: RunEvent[] }) {
  if (logs.length === 0) return null;
  return (
    <div
      style={{
        borderTop: '1px solid #2a2a2a',
        background: '#0a0a0a',
        maxHeight: 200,
        overflowY: 'auto',
        padding: '8px 14px',
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#777',
      }}
    >
      {logs.map((e, i) => {
        if (e.type === 'stage_done') {
          const success = e['success'];
          return (
            <div key={i} style={{ color: success ? '#4ade80' : '#f87171', marginBottom: 2 }}>
              ✓ {String(e['stageName'])} — {String(e['durationMs'])}ms{' '}
              {!success && `❌ ${String(e['error'])}`}
            </div>
          );
        }
        if (e.type === 'stage_start') {
          return (
            <div key={i} style={{ color: '#60a5fa', marginBottom: 2 }}>
              ▶ {String(e['stageName'])} [{String(e['stageType'])}]
            </div>
          );
        }
        if (e.type === 'pipeline_done') {
          return (
            <div key={i} style={{ color: '#a78bfa', marginBottom: 2, fontWeight: 700 }}>
              ✔ Pipeline completata — {String(e['succeededStages'])}/{String(e['totalStages'])}{' '}
              stage in {String(e['totalDurationMs'])}ms
            </div>
          );
        }
        if (e.type === 'pipeline_error') {
          return (
            <div key={i} style={{ color: '#f87171', marginBottom: 2 }}>
              ✗ Errore: {String(e['error'])}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export function App() {
  const {
    summaries,
    current,
    selectedStageId,
    runLogs,
    isRunning,
    isDirty,
    loadList,
    loadPipeline,
    savePipeline,
    deletePipeline,
    createNew,
    updatePipelineMeta,
    addStage,
    updateStage,
    removeStage,
    reorderStages,
    setSelectedStageId,
    runPipeline,
  } = usePipeline();

  const [runTask, setRunTask] = useState('');
  const [showRunInput, setShowRunInput] = useState(false);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const selectedStage = current?.stages.find((s) => s.id === selectedStageId) ?? null;

  const handleRun = async () => {
    if (!current?.id) {
      alert('Salva la pipeline prima di eseguirla.');
      return;
    }
    setShowRunInput(true);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '200px 1fr auto',
        gridTemplateRows: '48px 1fr auto',
        height: '100vh',
        background: '#0d0d0d',
        color: '#e5e5e5',
        fontFamily: "'Inter', system-ui, sans-serif",
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          gridColumn: '1 / -1',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 16px',
          background: '#111',
          borderBottom: '1px solid #2a2a2a',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: '#aaa', letterSpacing: 0.5 }}>
          addomatic
        </span>
        <span style={{ color: '#333' }}>|</span>

        {current ? (
          <>
            <input
              value={current.name}
              onChange={(e) => updatePipelineMeta({ name: e.target.value })}
              style={{
                background: 'none',
                border: 'none',
                color: '#e5e5e5',
                fontSize: 14,
                fontWeight: 600,
                outline: 'none',
                width: 240,
              }}
            />
            {isDirty && (
              <span style={{ fontSize: 11, color: '#555' }}>• non salvato</span>
            )}
          </>
        ) : (
          <span style={{ color: '#555', fontSize: 13 }}>Seleziona o crea una pipeline</span>
        )}

        <div style={{ flex: 1 }} />

        {current && (
          <>
            <button
              onClick={savePipeline}
              disabled={!isDirty}
              style={{
                background: isDirty ? '#1e6feb' : '#1a1a1a',
                border: `1px solid ${isDirty ? '#1e6feb' : '#333'}`,
                borderRadius: 5,
                color: isDirty ? '#fff' : '#555',
                fontSize: 12,
                padding: '5px 14px',
                cursor: isDirty ? 'pointer' : 'default',
              }}
            >
              Salva
            </button>
            <button
              onClick={handleRun}
              disabled={isRunning || !current.id}
              style={{
                background: isRunning ? '#1a1a1a' : '#16a34a',
                border: `1px solid ${isRunning ? '#333' : '#16a34a'}`,
                borderRadius: 5,
                color: isRunning ? '#555' : '#fff',
                fontSize: 12,
                padding: '5px 14px',
                cursor: isRunning ? 'default' : 'pointer',
              }}
            >
              {isRunning ? '⏳ Running…' : '▶ Esegui'}
            </button>
          </>
        )}
      </div>

      {/* Left: pipeline list */}
      <div style={{ gridRow: '2 / 4', overflow: 'hidden' }}>
        <PipelineList
          summaries={summaries}
          currentId={current?.id}
          onSelect={loadPipeline}
          onNew={createNew}
          onDelete={deletePipeline}
        />
      </div>

      {/* Center: canvas */}
      <div style={{ gridRow: 2, overflow: 'hidden' }}>
        {current ? (
          <PipelineCanvas
            stages={current.stages}
            selectedStageId={selectedStageId}
            onSelectStage={setSelectedStageId}
            onDeleteStage={removeStage}
            onReorder={reorderStages}
            onAddStage={addStage}
          />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#333',
              fontSize: 14,
            }}
          >
            Seleziona una pipeline dalla lista o creane una nuova
          </div>
        )}
      </div>

      {/* Right: stage panel */}
      <div
        style={{
          gridRow: 2,
          width: selectedStage ? 340 : 0,
          overflow: 'hidden',
          borderLeft: selectedStage ? '1px solid #2a2a2a' : 'none',
          transition: 'width 0.15s',
          background: '#111',
        }}
      >
        {selectedStage && (
          <StagePanel
            stage={selectedStage}
            onChange={updateStage}
          />
        )}
      </div>

      {/* Bottom: run logs */}
      <div style={{ gridColumn: '2 / -1', gridRow: 3 }}>
        <RunLog logs={runLogs} />
      </div>

      {/* Run task modal */}
      {showRunInput && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowRunInput(false)}
        >
          <div
            style={{
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: 8,
              padding: 24,
              width: 420,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              Task iniziale per la pipeline
            </div>
            <input
              autoFocus
              style={{
                width: '100%',
                background: '#111',
                border: '1px solid #444',
                borderRadius: 4,
                color: '#e5e5e5',
                padding: '8px 10px',
                fontSize: 13,
                boxSizing: 'border-box',
                marginBottom: 14,
              }}
              placeholder={`es. "Analizza l'architettura del progetto X"`}
              value={runTask}
              onChange={(e) => setRunTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setShowRunInput(false);
                  // usePipeline.runPipeline requires being called from the hook
                  // We pass the task up via state: handled below
                }
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowRunInput(false)}
                style={{
                  background: 'none',
                  border: '1px solid #444',
                  borderRadius: 4,
                  color: '#aaa',
                  padding: '6px 16px',
                  cursor: 'pointer',
                }}
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  setShowRunInput(false);
                  void runPipeline(runTask || (current?.name ?? ''));
                }}
                style={{
                  background: '#16a34a',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  padding: '6px 16px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                ▶ Esegui
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
