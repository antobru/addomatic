import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PipelineStorage } from './interface.js';
import type { SerializablePipeline, PipelineSummary } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(__dirname, '../data');

export class JsonFileStorage implements PipelineStorage {
  constructor(private readonly dataDir = DEFAULT_DATA_DIR) {}

  private filePath(id: string): string {
    return join(this.dataDir, `${id}.json`);
  }

  async list(): Promise<PipelineSummary[]> {
    await mkdir(this.dataDir, { recursive: true });
    let files: string[];
    try {
      files = await readdir(this.dataDir);
    } catch {
      return [];
    }

    const summaries: PipelineSummary[] = [];
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      try {
        const content = await readFile(join(this.dataDir, file), 'utf-8');
        const p: SerializablePipeline = JSON.parse(content);
        summaries.push({
          id: p.id,
          name: p.name,
          description: p.description,
          updatedAt: p.updatedAt,
          stageCount: p.stages.length,
        });
      } catch {
        // skip corrupted files
      }
    }

    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<SerializablePipeline | null> {
    try {
      const content = await readFile(this.filePath(id), 'utf-8');
      return JSON.parse(content) as SerializablePipeline;
    } catch {
      return null;
    }
  }

  async save(pipeline: SerializablePipeline): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.filePath(pipeline.id), JSON.stringify(pipeline, null, 2), 'utf-8');
  }

  async delete(id: string): Promise<void> {
    try {
      await unlink(this.filePath(id));
    } catch {
      // ignore not found
    }
  }
}
