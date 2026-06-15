import type { VarDefinition } from '../types.js';

interface Props {
  vars: VarDefinition[];
  onChange: (vars: VarDefinition[]) => void;
}

const INPUT = 'w-full bg-zinc-950 border border-zinc-700/70 rounded-lg text-zinc-200 text-sm px-3 py-1.5 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 placeholder:text-zinc-600 transition-colors font-sans';

export function VarsEditor({ vars, onChange }: Props) {
  const add = () => onChange([...vars, { name: '', defaultValue: '', description: '' }]);
  const update = (i: number, patch: Partial<VarDefinition>) =>
    onChange(vars.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const remove = (i: number) => onChange(vars.filter((_, idx) => idx !== i));

  return (
    <div className="p-4 bg-zinc-900 border-b border-zinc-800">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-[11px] font-semibold tracking-widest text-zinc-400 uppercase">
            Variabili Pipeline
          </h3>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            Template:{' '}
            <code className="text-sky-400 font-mono">{'{vars.nome}'}</code>
            {'  ·  '}
            Codice:{' '}
            <code className="text-sky-400 font-mono">ctx.vars.nome</code>
          </p>
        </div>
        <button
          onClick={add}
          className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-zinc-300 rounded-lg px-3 py-1.5 transition-colors font-medium"
        >
          <span className="text-blue-400 text-sm leading-none">+</span>
          Aggiungi
        </button>
      </div>

      {vars.length === 0 ? (
        <div className="py-4 text-center text-zinc-600 text-xs">
          Nessuna variabile definita
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_28px] gap-2 px-1">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Nome</span>
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Default</span>
            <span />
          </div>
          {vars.map((v, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_28px] gap-2 items-center">
              <input
                className={INPUT + ' font-mono text-xs'}
                placeholder="nome"
                value={v.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
              <input
                className={INPUT}
                placeholder="valore"
                value={v.defaultValue}
                onChange={(e) => update(i, { defaultValue: e.target.value })}
              />
              <button
                onClick={() => remove(i)}
                className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-base"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
