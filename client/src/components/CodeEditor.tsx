import MonacoEditor from '@monaco-editor/react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  height?: number;
  label?: string;
}

export function CodeEditor({ value, onChange, height = 200, label }: Props) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && (
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4, fontFamily: 'monospace' }}>
          {label}
        </div>
      )}
      <div style={{ border: '1px solid #333', borderRadius: 4, overflow: 'hidden' }}>
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
          }}
        />
      </div>
    </div>
  );
}
