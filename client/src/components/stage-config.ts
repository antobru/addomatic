import type { StageType } from '../types.js';

export interface StageTypeConfig {
  label: string;
  // Canvas (StageNode)
  indicator: string;
  ring: string;
  // Panel (StagePanel)
  bar: string;
  badge: string;
  // Shared text color
  text: string;
  // PipelineCanvas toolbar
  bg: string;
  border: string;
  color: string;
}

export const STAGE_TYPE_CONFIG: Record<StageType, StageTypeConfig> = {
  swarm: {
    label: 'SWARM',
    text: 'text-violet-400',
    color: 'text-violet-400',
    indicator: 'bg-violet-500',
    ring: 'ring-violet-500/40',
    bar: 'bg-violet-500',
    badge: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    bg: 'bg-violet-500/10 hover:bg-violet-500/20',
    border: 'border-violet-500/40 hover:border-violet-500/70',
  },
  agent: {
    label: 'AGENT',
    text: 'text-sky-400',
    color: 'text-sky-400',
    indicator: 'bg-sky-500',
    ring: 'ring-sky-500/40',
    bar: 'bg-sky-500',
    badge: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    bg: 'bg-sky-500/10 hover:bg-sky-500/20',
    border: 'border-sky-500/40 hover:border-sky-500/70',
  },
  transform: {
    label: 'TRANSFORM',
    text: 'text-emerald-400',
    color: 'text-emerald-400',
    indicator: 'bg-emerald-500',
    ring: 'ring-emerald-500/40',
    bar: 'bg-emerald-500',
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    bg: 'bg-emerald-500/10 hover:bg-emerald-500/20',
    border: 'border-emerald-500/40 hover:border-emerald-500/70',
  },
  action: {
    label: 'ACTION',
    text: 'text-amber-400',
    color: 'text-amber-400',
    indicator: 'bg-amber-500',
    ring: 'ring-amber-500/40',
    bar: 'bg-amber-500',
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    bg: 'bg-amber-500/10 hover:bg-amber-500/20',
    border: 'border-amber-500/40 hover:border-amber-500/70',
  },
};
