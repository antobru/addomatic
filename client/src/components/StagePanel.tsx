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

interface Props {
  stage: SerializableStageConfig;
  onChange: (stage: SerializableStageConfig) => void;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          color: '#888',
          marginBottom: 4,
          fontFamily: 'monospace',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const INPUT: React.CSSProperties = {
  width: '100%',
  background: '#1e1e1e',
  border: '1px solid #333',
  borderRadius: 4,
  color: '#e5e5e5',
  padding: '6px 8px',
  fontSize: 13,
  boxSizing: 'border-box',
};

const SELECT: React.CSSProperties = { ...INPUT };

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
          style={INPUT}
          value={config.model}
          onChange={(e) => onChange({ ...config, model: e.target.value })}
        />
      </Field>
      <Field label="systemPrompt">
        <textarea
          style={{ ...INPUT, height: 80, resize: 'vertical' }}
          value={config.systemPrompt}
          onChange={(e) => onChange({ ...config, systemPrompt: e.target.value })}
        />
      </Field>
      <Field label="maxIterations">
        <input
          style={INPUT}
          type="number"
          value={config.maxIterations ?? 10}
          onChange={(e) => onChange({ ...config, maxIterations: parseInt(e.target.value) || 10 })}
        />
      </Field>
      <Field label="temperature (0–1)">
        <input
          style={INPUT}
          type="number"
          step="0.1"
          min="0"
          max="1"
          value={config.temperature ?? 0.7}
          onChange={(e) =>
            onChange({ ...config, temperature: parseFloat(e.target.value) || 0.7 })
          }
        />
      </Field>
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
          style={SELECT}
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
        <Field label="extractMarker (opzionale, es. ANSWER:)">
          <input
            style={INPUT}
            value={config.extractMarker ?? ''}
            onChange={(e) =>
              onChange({ ...config, extractMarker: e.target.value || undefined })
            }
          />
        </Field>
      )}
      {config.type === 'llm_judge' && (
        <>
          <Field label="judge model">
            <input
              style={INPUT}
              value={config.model}
              onChange={(e) => onChange({ ...config, model: e.target.value })}
            />
          </Field>
          <Field label="synthesize">
            <select
              style={SELECT}
              value={config.synthesize ? 'true' : 'false'}
              onChange={(e) => onChange({ ...config, synthesize: e.target.value === 'true' })}
            >
              <option value="false">false (scegli il migliore)</option>
              <option value="true">true (sintetizza)</option>
            </select>
          </Field>
        </>
      )}
    </>
  );
}

// ── Per-type panels ────────────────────────────────────────────────────────

function SwarmPanel({ stage, onChange }: { stage: SerializableSwarmStage; onChange: (s: SerializableStageConfig) => void }) {
  return (
    <>
      <Field label="task (template: {original}, {previous}, {stages.NAME})">
        <input
          style={INPUT}
          value={stage.task ?? ''}
          placeholder="{previous}"
          onChange={(e) => onChange({ ...stage, task: e.target.value || undefined })}
        />
      </Field>
      <Field label="size (numero agenti)">
        <input
          style={INPUT}
          type="number"
          min="1"
          value={stage.size}
          onChange={(e) => onChange({ ...stage, size: parseInt(e.target.value) || 2 })}
        />
      </Field>
      <AgentConfigForm
        config={stage.agentConfig}
        onChange={(c) => onChange({ ...stage, agentConfig: c })}
      />
      <AggregatorForm
        config={stage.aggregator}
        onChange={(c) => onChange({ ...stage, aggregator: c })}
      />
    </>
  );
}

function AgentPanel({ stage, onChange }: { stage: SerializableAgentStage; onChange: (s: SerializableStageConfig) => void }) {
  return (
    <>
      <Field label="task (template: {original}, {previous}, {stages.NAME})">
        <input
          style={INPUT}
          value={stage.task ?? ''}
          placeholder="{previous}"
          onChange={(e) => onChange({ ...stage, task: e.target.value || undefined })}
        />
      </Field>
      <AgentConfigForm
        config={stage.agentConfig}
        onChange={(c) => onChange({ ...stage, agentConfig: c })}
      />
    </>
  );
}

function TransformPanel({ stage, onChange }: { stage: SerializableTransformStage; onChange: (s: SerializableStageConfig) => void }) {
  return (
    <CodeEditor
      label="(ctx: PipelineContext) => string | Promise<string>"
      value={stage.code}
      onChange={(code) => onChange({ ...stage, code })}
      height={300}
    />
  );
}

function ActionPanel({ stage, onChange }: { stage: SerializableActionStage; onChange: (s: SerializableStageConfig) => void }) {
  return (
    <>
      <Field label="task (template: {original}, {previous}, {stages.NAME})">
        <input
          style={INPUT}
          value={stage.task ?? ''}
          placeholder="{previous}"
          onChange={(e) => onChange({ ...stage, task: e.target.value || undefined })}
        />
      </Field>
      <Field label="timeout (ms, opzionale)">
        <input
          style={INPUT}
          type="number"
          value={stage.timeout ?? ''}
          placeholder="nessun timeout"
          onChange={(e) =>
            onChange({ ...stage, timeout: e.target.value ? parseInt(e.target.value) : undefined })
          }
        />
      </Field>
      <CodeEditor
        label="async (ctx: PipelineContext, resolvedTask: string) => string | Promise<string>"
        value={stage.code}
        onChange={(code) => onChange({ ...stage, code })}
        height={300}
      />
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function StagePanel({ stage, onChange }: Props) {
  return (
    <div
      style={{
        padding: 16,
        overflowY: 'auto',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Field label="name">
        <input
          style={INPUT}
          value={stage.name}
          onChange={(e) => onChange({ ...stage, name: e.target.value })}
        />
      </Field>

      <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '16px 0' }} />

      {stage.type === 'swarm' && (
        <SwarmPanel stage={stage} onChange={onChange} />
      )}
      {stage.type === 'agent' && (
        <AgentPanel stage={stage} onChange={onChange} />
      )}
      {stage.type === 'transform' && (
        <TransformPanel stage={stage} onChange={onChange} />
      )}
      {stage.type === 'action' && (
        <ActionPanel stage={stage} onChange={onChange} />
      )}
    </div>
  );
}
