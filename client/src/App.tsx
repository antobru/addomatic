import { useEffect, useState } from 'react';
import { usePipeline } from './hooks/usePipeline.js';
import { PipelineList } from './components/PipelineList.js';
import { PipelineCanvas } from './components/PipelineCanvas.js';
import { StagePanel } from './components/StagePanel.js';
import { VarsEditor } from './components/VarsEditor.js';
import { SecretsPage } from './components/SecretsPage.js';
import type { RunEvent } from './types.js';

type View = 'pipelines' | 'secrets';

// ── Run log ───────────────────────────────────────────────────────────────────

function RunLog({ logs, onClear }: { logs: RunEvent[]; onClear: () => void }) {
  if (logs.length === 0) return null;
  return (
    <div className="flex-shrink-0 border-t border-zinc-800 bg-zinc-950 max-h-44 overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-zinc-800/60">
        <span className="text-[10px] font-bold tracking-widest text-zinc-600 uppercase">Output</span>
        <button
          onClick={onClear}
          className="text-[10px] text-zinc-700 hover:text-zinc-400 transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="px-4 py-2.5 space-y-1 font-mono text-[11px]">
        {logs.map((e, i) => {
          if (e.type === 'stage_start') {
            return (
              <div key={i} className="flex items-center gap-2 text-blue-400">
                <span className="text-zinc-600">▶</span>
                <span>{String(e['stageName'])}</span>
                <span className="text-zinc-700 text-[10px]">[{String(e['stageType'])}]</span>
              </div>
            );
          }
          if (e.type === 'stage_done') {
            const ok = e['success'];
            return (
              <div key={i} className={`flex items-center gap-2 ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
                <span>{ok ? '✓' : '✗'}</span>
                <span>{String(e['stageName'])}</span>
                <span className="text-zinc-600 text-[10px]">{String(e['durationMs'])}ms</span>
                {!ok && <span className="text-red-500/80">{String(e['error'])}</span>}
              </div>
            );
          }
          if (e.type === 'pipeline_done') {
            return (
              <div key={i} className="text-violet-400 font-semibold">
                ✔ Pipeline completata — {String(e['succeededStages'])}/{String(e['totalStages'])} stage in {String(e['totalDurationMs'])}ms
              </div>
            );
          }
          if (e.type === 'pipeline_error') {
            return (
              <div key={i} className="text-red-400">
                ✗ Errore: {String(e['error'])}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

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
    clearLogs,
  } = usePipeline();

  const [view, setView] = useState<View>('pipelines');
  const [runTask, setRunTask] = useState('');
  const [showRunModal, setShowRunModal] = useState(false);
  const [showVarsEditor, setShowVarsEditor] = useState(false);
  const [runVars, setRunVars] = useState<Record<string, string>>({});

  useEffect(() => { loadList(); }, [loadList]);

  const selectedStage = current?.stages.find((s) => s.id === selectedStageId) ?? null;

  const handleRun = () => {
    if (!current?.id) { alert('Salva la pipeline prima di eseguirla.'); return; }
    const defaults = Object.fromEntries((current.vars ?? []).map((v) => [v.name, v.defaultValue]));
    setRunVars(defaults);
    setShowRunModal(true);
  };

  const doRun = () => {
    setShowRunModal(false);
    void runPipeline(runTask || (current?.name ?? ''), runVars);
  };

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Toolbar ── */}
      <header className="h-14 flex items-center gap-3 px-4 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 flex-shrink-0 z-10">
        {/* Logo */}
        <div className="flex items-center gap-2.5 pr-4 border-r border-zinc-800">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-white text-xs font-bold">⬡</span>
          </div>
          <div>
            <div className="text-sm font-bold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent leading-none tracking-tight">
              addomatic
            </div>
            <div className="text-[9px] text-zinc-600 leading-none mt-0.5 tracking-wider">
              AI PIPELINE BUILDER
            </div>
          </div>
        </div>

        {/* Nav tabs */}
        <div className="flex items-center gap-0.5 px-1">
          {(['pipelines', 'secrets'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all capitalize ${
                view === v
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {v === 'pipelines' ? 'Pipelines' : '🔑 Secrets'}
            </button>
          ))}
        </div>

        {/* Pipeline name */}
        {view === 'pipelines' && current ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <input
              value={current.name}
              onChange={(e) => updatePipelineMeta({ name: e.target.value })}
              className="bg-transparent text-zinc-100 text-sm font-semibold outline-none border-none w-56 placeholder:text-zinc-600 min-w-0"
              placeholder="Nome pipeline"
            />
            {isDirty && (
              <span
                className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50"
                title="Modifiche non salvate"
              />
            )}
          </div>
        ) : view === 'pipelines' ? (
          <span className="text-zinc-600 text-sm">Seleziona o crea una pipeline</span>
        ) : null}

        <div className="flex-1" />

        {/* Actions */}
        {view === 'pipelines' && current && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVarsEditor((v) => !v)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                showVarsEditor
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                  : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
              }`}
              title="Variabili pipeline"
            >
              {'{ }'} Vars{current.vars?.length ? ` · ${current.vars.length}` : ''}
            </button>

            <button
              onClick={savePipeline}
              disabled={!isDirty}
              className={`text-xs px-4 py-1.5 rounded-lg font-semibold transition-all ${
                isDirty
                  ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-md shadow-blue-500/20'
                  : 'bg-zinc-800 text-zinc-600 cursor-default'
              }`}
            >
              Salva
            </button>

            <button
              onClick={handleRun}
              disabled={isRunning || !current.id}
              className={`text-xs px-4 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                isRunning || !current.id
                  ? 'bg-zinc-800 text-zinc-600 cursor-default'
                  : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-md shadow-emerald-500/20'
              }`}
            >
              {isRunning ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
                  Running…
                </>
              ) : (
                <>▶ Esegui</>
              )}
            </button>
          </div>
        )}
      </header>

      {/* ── Secrets view ── */}
      {view === 'secrets' && <SecretsPage />}

      {/* ── Pipelines view ── */}
      {view === 'pipelines' && <>

      {/* ── Vars editor dropdown ── */}
      {showVarsEditor && current && (
        <div className="flex-shrink-0 border-b border-zinc-800">
          <VarsEditor
            vars={current.vars ?? []}
            onChange={(vars) => updatePipelineMeta({ vars })}
          />
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <div className="w-52 flex-shrink-0">
          <PipelineList
            summaries={summaries}
            currentId={current?.id}
            onSelect={loadPipeline}
            onNew={createNew}
            onDelete={deletePipeline}
          />
        </div>

        {/* Canvas */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
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
            <div className="h-full flex flex-col items-center justify-center gap-4 text-zinc-700">
              <div className="text-6xl opacity-10">⬡</div>
              <div className="text-center">
                <p className="text-sm text-zinc-500">Seleziona una pipeline</p>
                <p className="text-xs text-zinc-700 mt-1">o creane una nuova dalla sidebar</p>
              </div>
            </div>
          )}
        </div>

        {/* Stage panel — slides in */}
        <div
          className={`flex-shrink-0 border-l border-zinc-800 transition-all duration-200 overflow-hidden ${
            selectedStage ? 'w-[360px]' : 'w-0'
          }`}
        >
          {selectedStage && (
            <StagePanel
              stage={selectedStage}
              onChange={updateStage}
              onClose={() => setSelectedStageId(null)}
            />
          )}
        </div>
      </div>

      {/* ── Run log ── */}
      <RunLog logs={runLogs} onClear={clearLogs} />

      {/* ── Run modal ── */}
      {showRunModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setShowRunModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl shadow-black/60 p-6 w-[480px] max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">Esegui pipeline</h2>
                <p className="text-xs text-zinc-500 mt-0.5">{current?.name}</p>
              </div>
              <button
                onClick={() => setShowRunModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Task input */}
            <div className="mb-5">
              <label className="block text-[10px] font-semibold tracking-widest text-zinc-500 uppercase mb-2">
                Task iniziale
              </label>
              <textarea
                autoFocus
                className="w-full bg-zinc-950 border border-zinc-700/70 rounded-xl text-zinc-100 text-sm px-4 py-3 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 placeholder:text-zinc-600 resize-none transition-colors leading-relaxed"
                rows={3}
                placeholder="es. Analizza l'architettura del progetto X"
                value={runTask}
                onChange={(e) => setRunTask(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doRun(); } }}
              />
              <p className="text-[10px] text-zinc-700 mt-1.5">Invio per eseguire · Shift+Invio per andare a capo</p>
            </div>

            {/* Vars overrides */}
            {(current?.vars ?? []).length > 0 && (
              <div className="mb-5">
                <label className="block text-[10px] font-semibold tracking-widest text-zinc-500 uppercase mb-2">
                  Variabili
                </label>
                <div className="space-y-2 bg-zinc-950/60 rounded-xl border border-zinc-800 p-3">
                  {(current?.vars ?? []).map((v) => (
                    <div key={v.name} className="grid grid-cols-[110px_1fr] gap-3 items-center">
                      <div className="text-xs text-sky-400 font-mono truncate">{v.name}</div>
                      <input
                        className="bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 text-sm px-3 py-1.5 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors w-full"
                        value={runVars[v.name] ?? v.defaultValue}
                        onChange={(e) => setRunVars((prev) => ({ ...prev, [v.name]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowRunModal(false)}
                className="text-sm px-4 py-2 rounded-xl border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors font-medium"
              >
                Annulla
              </button>
              <button
                onClick={doRun}
                className="text-sm px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold transition-all shadow-md shadow-emerald-500/20"
              >
                ▶ Esegui
              </button>
            </div>
          </div>
        </div>
      )}

      </>}
    </div>
  );
}
