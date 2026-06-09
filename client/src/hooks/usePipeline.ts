import { useState, useCallback } from 'react';
import type {
  SerializablePipeline,
  PipelineSummary,
  SerializableStageConfig,
  RunEvent,
} from '../types.js';

const API = '/api/pipelines';

function newId(): string {
  return crypto.randomUUID();
}

export function usePipeline() {
  const [summaries, setSummaries] = useState<PipelineSummary[]>([]);
  const [current, setCurrent] = useState<SerializablePipeline | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [runLogs, setRunLogs] = useState<RunEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // ── API helpers ───────────────────────────────────────────────────────────

  const loadList = useCallback(async () => {
    const res = await fetch(API);
    setSummaries(await res.json());
  }, []);

  const loadPipeline = useCallback(async (id: string) => {
    const res = await fetch(`${API}/${id}`);
    const p: SerializablePipeline = await res.json();
    setCurrent(p);
    setSelectedStageId(null);
    setRunLogs([]);
    setIsDirty(false);
  }, []);

  const savePipeline = useCallback(async () => {
    if (!current) return;
    const method = current.id ? 'PUT' : 'POST';
    const url = current.id ? `${API}/${current.id}` : API;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current),
    });
    const saved: SerializablePipeline = await res.json();
    setCurrent(saved);
    setIsDirty(false);
    await loadList();
  }, [current, loadList]);

  const deletePipeline = useCallback(
    async (id: string) => {
      await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (current?.id === id) {
        setCurrent(null);
        setSelectedStageId(null);
      }
      await loadList();
    },
    [current, loadList],
  );

  // ── Pipeline mutation ─────────────────────────────────────────────────────

  const createNew = useCallback(() => {
    const now = new Date().toISOString();
    setCurrent({
      id: '',
      name: 'Nuova pipeline',
      createdAt: now,
      updatedAt: now,
      stopOnFailure: true,
      stages: [],
    });
    setSelectedStageId(null);
    setRunLogs([]);
    setIsDirty(true);
  }, []);

  const updatePipelineMeta = useCallback(
    (patch: Partial<Pick<SerializablePipeline, 'name' | 'description' | 'stopOnFailure'>>) => {
      setCurrent((p) => (p ? { ...p, ...patch } : p));
      setIsDirty(true);
    },
    [],
  );

  const addStage = useCallback((type: SerializableStageConfig['type']) => {
    const id = newId();
    const base = { id, name: type };
    let stage: SerializableStageConfig;
    switch (type) {
      case 'swarm':
        stage = {
          ...base,
          type: 'swarm',
          size: 3,
          agentConfig: { model: 'claude-haiku-4-5-20251001', systemPrompt: '' },
          aggregator: { type: 'majority_vote' },
        };
        break;
      case 'agent':
        stage = {
          ...base,
          type: 'agent',
          agentConfig: { model: 'claude-haiku-4-5-20251001', systemPrompt: '' },
        };
        break;
      case 'transform':
        stage = { ...base, type: 'transform', code: "return ctx.previous?.output ?? ''" };
        break;
      case 'action':
        stage = {
          ...base,
          type: 'action',
          code: "// async (ctx, resolvedTask) => string\nreturn resolvedTask",
        };
        break;
    }
    setCurrent((p) =>
      p ? { ...p, stages: [...p.stages, stage] } : p,
    );
    setSelectedStageId(id);
    setIsDirty(true);
  }, []);

  const updateStage = useCallback((updated: SerializableStageConfig) => {
    setCurrent((p) =>
      p
        ? { ...p, stages: p.stages.map((s) => (s.id === updated.id ? updated : s)) }
        : p,
    );
    setIsDirty(true);
  }, []);

  const removeStage = useCallback((stageId: string) => {
    setCurrent((p) =>
      p ? { ...p, stages: p.stages.filter((s) => s.id !== stageId) } : p,
    );
    setSelectedStageId((sel) => (sel === stageId ? null : sel));
    setIsDirty(true);
  }, []);

  const reorderStages = useCallback((stages: SerializableStageConfig[]) => {
    setCurrent((p) => (p ? { ...p, stages } : p));
    setIsDirty(true);
  }, []);

  // ── Run ───────────────────────────────────────────────────────────────────

  const runPipeline = useCallback(
    async (task: string) => {
      if (!current?.id) return;
      setRunLogs([]);
      setIsRunning(true);

      const res = await fetch(`${API}/${current.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) { setIsRunning(false); return; }

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            setRunLogs((logs) => [...logs, JSON.parse(payload) as RunEvent]);
          } catch {
            // ignore malformed
          }
        }
      }

      setIsRunning(false);
    },
    [current],
  );

  return {
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
  };
}
