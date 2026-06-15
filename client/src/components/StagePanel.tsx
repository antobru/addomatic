import { CodeEditor } from './CodeEditor.js';
import type {
  SerializableStageConfig,
  SerializableSwarmStage,
  SerializableAgentStage,
  SerializableTransformStage,
  SerializableActionStage,
  AgentConfigSerializable,
  AggregatorConfig,
} from '../types.js';

const TYPE_CONFIG: Record<
  SerializableStageConfig['type'],
  { label: string; text: string; bar: string; badge: string }
> = {
  swarm: { label: 'SWARM', text: 'text-violet-400', bar: 'bg-violet-500', badge: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  agent: { label: 'AGENT', text: 'text-sky-400', bar: 'bg-sky-500', badge: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  transform: { label: 'TRANSFORM', text: 'text-emerald-400', bar: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  action: { label: 'ACTION', text: 'text-amber-400', bar: 'bg-amber-500', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
};

interface Props {
  stage: SerializableStageConfig;
  onChange: (stage: SerializableStageConfig) => void;
  onClose: () => void;
}

const INPUT = 'w-full bg-zinc-950 border border-zinc-700/70 rounded-lg text-zinc-200 text-sm px-3 py-2 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 placeholder:text-zinc-600 transition-colors';
const SELECT = INPUT + ' cursor-pointer';
const TEXTAREA = INPUT + ' resize-y leading-relaxed';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5 font-mono">
        {label}
      </label>
      {children}
    </div>
  );
}

function AgentConfigForm({
  config,
  onChange,
}: {
  config: AgentConfigSerializable;
  onChange: (c: AgentConfigSerializable) => void;
}) {
  return (
    <>
      <Field label="model">
        <input
          className={INPUT}
          value={config.model}
          onChange={(e) => onChange({ ...config, model: e.target.value })}
        />
      </Field>
      <Field label="systemPrompt">
        <textarea
          className={TEXTAREA}
          style={{ minHeight: 80 }}
          value={config.systemPrompt}
          onChange={(e) => onChange({ ...config, systemPrompt: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="maxIterations">
          <input
            className={INPUT}
            type="number"
            value={config.maxIterations ?? 10}
            onChange={(e) => onChange({ ...config, maxIterations: parseInt(e.target.value) || 10 })}
          />
        </Field>
        <Field label="temperature">
          <input
            className={INPUT}
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={config.temperature ?? 0.7}
            onChange={(e) => onChange({ ...config, temperature: parseFloat(e.target.value) || 0.7 })}
          />
        </Field>
      </div>
    </>
  );
}

function AggregatorForm({
  config,
  onChange,
}: {
  config: AggregatorConfig;
  onChange: (c: AggregatorConfig) => void;
}) {
  return (
    <>
      <Field label="aggregator.type">
        <select
          className={SELECT}
          value={config.type}
          onChange={(e) => {
            const t = e.target.value as AggregatorConfig['type'];
            if (t === 'majority_vote') onChange({ type: 'majority_vote' });
            else onChange({ type: 'llm_judge', model: 'claude-haiku-4-5-20251001' });
          }}
        >
          <option value="majority_vote">majority_vote</option>
          <option value="llm_judge">llm_judge</option>
        </select>
      </Field>
      {config.type === 'majority_vote' && (
        <Field label="extractMarker (es. ANSWER:)">
          <input
            className={INPUT}
            value={config.extractMarker ?? ''}
            placeholder="opzionale"
            onChange={(e) => onChange({ ...config, extractMarker: e.target.value || undefined })}
          />
        </Field>
      )}
      {config.type === 'llm_judge' && (
        <>
          <Field label="judge model">
            <input
              className={INPUT}
              value={config.model}
              onChange={(e) => onChange({ ...config, model: e.target.value })}
            />
          </Field>
          <Field label="synthesize">
            <select
              className={SELECT}
              value={config.synthesize ? 'true' : 'false'}
              onChange={(e) => onChange({ ...config, synthesize: e.target.value === 'true' })}
            >
              <option value="false">false — scegli il migliore</option>
              <option value="true">true — sintetizza</option>
            </select>
          </Field>
        </>
      )}
    </>
  );
}

function SwarmPanel({ stage, onChange }: { stage: SerializableSwarmStage; onChange: (s: SerializableStageConfig) => void }) {
  return (
    <>
      <Field label="task template">
        <input
          className={INPUT}
          value={stage.task ?? ''}
          placeholder="{previous}"
          onChange={(e) => onChange({ ...stage, task: e.target.value || undefined })}
        />
      </Field>
      <Field label="size (agenti)">
        <input
          className={INPUT}
          type="number"
          min="1"
          value={stage.size}
          onChange={(e) => onChange({ ...stage, size: parseInt(e.target.value) || 2 })}
        />
      </Field>
      <div className="border-t border-zinc-800 my-4" />
      <AgentConfigForm config={stage.agentConfig} onChange={(c) => onChange({ ...stage, agentConfig: c })} />
      <div className="border-t border-zinc-800 my-4" />
      <AggregatorForm config={stage.aggregator} onChange={(c) => onChange({ ...stage, aggregator: c })} />
    </>
  );
}

function AgentPanel({ stage, onChange }: { stage: SerializableAgentStage; onChange: (s: SerializableStageConfig) => void }) {
  return (
    <>
      <Field label="task template">
        <input
          className={INPUT}
          value={stage.task ?? ''}
          placeholder="{previous}"
          onChange={(e) => onChange({ ...stage, task: e.target.value || undefined })}
        />
      </Field>
      <div className="border-t border-zinc-800 my-4" />
      <AgentConfigForm config={stage.agentConfig} onChange={(c) => onChange({ ...stage, agentConfig: c })} />
    </>
  );
}

function TransformPanel({ stage, onChange }: { stage: SerializableTransformStage; onChange: (s: SerializableStageConfig) => void }) {
  return (
    <CodeEditor
      label="(ctx: PipelineContext) => string | Promise<string>"
      value={stage.code}
      onChange={(code) => onChange({ ...stage, code })}
      height={320}
    />
  );
}

function ActionPanel({ stage, onChange }: { stage: SerializableActionStage; onChange: (s: SerializableStageConfig) => void }) {
  return (
    <>
      <Field label="task template">
        <input
          className={INPUT}
          value={stage.task ?? ''}
          placeholder="{previous}"
          onChange={(e) => onChange({ ...stage, task: e.target.value || undefined })}
        />
      </Field>
      <Field label="timeout (ms)">
        <input
          className={INPUT}
          type="number"
          value={stage.timeout ?? ''}
          placeholder="nessun timeout"
          onChange={(e) =>
            onChange({ ...stage, timeout: e.target.value ? parseInt(e.target.value) : undefined })
          }
        />
      </Field>
      <div className="border-t border-zinc-800 my-4" />
      <CodeEditor
        label="async (ctx: PipelineContext, resolvedTask: string) => string | Promise<string>"
        value={stage.code}
        onChange={(code) => onChange({ ...stage, code })}
        height={280}
      />
    </>
  );
}

export function StagePanel({ stage, onChange, onClose }: Props) {
  const cfg = TYPE_CONFIG[stage.type];

  return (
    <div className="flex flex-col h-full">
      {/* Top accent bar */}
      <div className={`h-[2px] ${cfg.bar} flex-shrink-0`} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0 bg-zinc-900">
        <span className={`text-[10px] font-bold tracking-[0.15em] uppercase font-mono px-2 py-0.5 rounded-md border ${cfg.badge}`}>
          {cfg.label}
        </span>
        <button
          onClick={onClose}
          title="Chiudi"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-base"
        >
          ✕
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 bg-zinc-900">
        <Field label="name">
          <input
            className={INPUT + ' text-base font-semibold'}
            value={stage.name}
            onChange={(e) => onChange({ ...stage, name: e.target.value })}
          />
        </Field>

        <div className="border-t border-zinc-800 my-4" />

        {stage.type === 'swarm' && <SwarmPanel stage={stage} onChange={onChange} />}
        {stage.type === 'agent' && <AgentPanel stage={stage} onChange={onChange} />}
        {stage.type === 'transform' && <TransformPanel stage={stage} onChange={onChange} />}
        {stage.type === 'action' && <ActionPanel stage={stage} onChange={onChange} />}
      </div>
    </div>
  );
}
