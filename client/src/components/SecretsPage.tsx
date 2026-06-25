import { useEffect, useRef, useState } from 'react';

const API = '/api/secrets';

export function SecretsPage() {
  const [keys, setKeys] = useState<string[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const valueRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch(API);
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setError(body.error ?? 'Failed to load secrets');
      return;
    }
    const data = await res.json() as { keys: string[] };
    setKeys(data.keys);
    setError(null);
  }

  useEffect(() => { void load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey.trim(), value: newValue.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? 'Failed to save secret');
        return;
      }
      setNewKey('');
      setNewValue('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(key: string) {
    setDeletingKey(key);
    try {
      await fetch(`${API}/${encodeURIComponent(key)}`, { method: 'DELETE' });
      await load();
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-950 p-8">
      <div className="max-w-xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Secrets</h1>
          <p className="text-xs text-zinc-500 mt-1">
            Cifrati AES-256-GCM sul server. I valori non sono mai restituiti dall'API.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Add form */}
        <form onSubmit={handleAdd} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <p className="text-[10px] font-bold tracking-widest text-zinc-600 uppercase">Nuovo secret</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1.5 font-medium">Chiave</label>
              <input
                className="w-full bg-zinc-950 border border-zinc-700/70 rounded-xl text-zinc-100 text-sm px-3 py-2 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 placeholder:text-zinc-600 font-mono transition-colors"
                placeholder="OPENAI_API_KEY"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Tab' && newKey.trim()) { e.preventDefault(); valueRef.current?.focus(); } }}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1.5 font-medium">Valore</label>
              <input
                ref={valueRef}
                type="password"
                className="w-full bg-zinc-950 border border-zinc-700/70 rounded-xl text-zinc-100 text-sm px-3 py-2 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 placeholder:text-zinc-600 font-mono transition-colors"
                placeholder="sk-••••••••"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !newKey.trim() || !newValue.trim()}
              className="text-sm px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-all shadow-md shadow-blue-500/20"
            >
              {saving ? 'Salvataggio…' : '+ Salva'}
            </button>
          </div>
        </form>

        {/* Keys list */}
        {keys.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800">
              <p className="text-[10px] font-bold tracking-widest text-zinc-600 uppercase">
                Secrets salvati ({keys.length})
              </p>
            </div>
            <ul className="divide-y divide-zinc-800/60">
              {keys.map((k) => (
                <li key={k} className="flex items-center justify-between px-5 py-3 group">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                    <span className="text-sm font-mono text-zinc-200 truncate">{k}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-zinc-600 font-mono tracking-wider">••••••••</span>
                    <button
                      onClick={() => handleDelete(k)}
                      disabled={deletingKey === k}
                      className="text-[10px] text-zinc-700 hover:text-red-400 transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                    >
                      {deletingKey === k ? '…' : 'elimina'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {keys.length === 0 && !error && (
          <p className="text-sm text-zinc-600 text-center py-6">Nessun secret salvato.</p>
        )}
      </div>
    </div>
  );
}
