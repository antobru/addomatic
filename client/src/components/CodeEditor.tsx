import MonacoEditor from '@monaco-editor/react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  height?: number;
  label?: string;
}

export function CodeEditor({ value, onChange, height = 200, label }: Props) {
  return (
    <div className="mb-3">
      {label && (
        <p className="text-[10px] font-mono text-zinc-500 mb-2 leading-relaxed truncate">{label}</p>
      )}
      <div className="rounded-lg overflow-hidden border border-zinc-700/60 ring-1 ring-zinc-800/60">
        <MonacoEditor
          height={height}
          language="javascript"
          theme="vs-dark"
          value={value}
          onChange={(v) => onChange(v ?? '')}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineNumbers: 'on',
            wordWrap: 'on',
            tabSize: 2,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        />
      </div>
    </div>
  );
}
