import type { SerializablePipeline, PipelineSummary } from '../types.js';

export interface PipelineStorage {
  list(): Promise<PipelineSummary[]>;
  get(id: string): Promise<SerializablePipeline | null>;
  save(pipeline: SerializablePipeline): Promise<void>;
  delete(id: string): Promise<void>;
}
