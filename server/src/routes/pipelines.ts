import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { Pipeline } from '../../../src/pipeline.js';
import type { PipelineStorage } from '../storage/interface.js';
import type { SerializablePipeline } from '../types.js';
import { buildPipelineConfig, createDefaultProvider, mergeVars } from '../runner.js';
import type { PipelineProgressEvent } from '../../../types.js';

export function createPipelinesRouter(storage: PipelineStorage): Router {
  const router = Router();

  // GET /api/pipelines — lista summaries
  router.get('/', async (_req, res) => {
    try {
      const list = await storage.list();
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/pipelines/:id — pipeline completa
  router.get('/:id', async (req, res) => {
    try {
      const pipeline = await storage.get(req.params['id']!);
      if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
      return res.json(pipeline);
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/pipelines — crea nuova
  router.post('/', async (req, res) => {
    try {
      const now = new Date().toISOString();
      const pipeline: SerializablePipeline = {
        id: randomUUID(),
        name: req.body.name ?? 'Nuova pipeline',
        description: req.body.description,
        createdAt: now,
        updatedAt: now,
        stopOnFailure: req.body.stopOnFailure ?? true,
        stages: req.body.stages ?? [],
      };
      await storage.save(pipeline);
      res.status(201).json(pipeline);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // PUT /api/pipelines/:id — aggiorna
  router.put('/:id', async (req, res) => {
    try {
      const existing = await storage.get(req.params['id']!);
      if (!existing) return res.status(404).json({ error: 'Pipeline not found' });

      const updated: SerializablePipeline = {
        ...existing,
        ...req.body,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await storage.save(updated);
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  // DELETE /api/pipelines/:id
  router.delete('/:id', async (req, res) => {
    try {
      await storage.delete(req.params['id']!);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/pipelines/:id/run — esegue con SSE
  router.post('/:id/run', async (req, res) => {
    const pipeline = await storage.get(req.params['id']!);
    if (!pipeline) {
      res.status(404).json({ error: 'Pipeline not found' });
      return;
    }

    // Setup SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event: PipelineProgressEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const provider = createDefaultProvider();
      const config = buildPipelineConfig(pipeline, provider, send);
      const runner = new Pipeline(provider, config);
      const task: string = req.body?.task ?? pipeline.name;
      const vars = mergeVars(pipeline, (req.body?.vars as Record<string, string>) ?? {});
      await runner.run(task, vars);
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({ type: 'pipeline_error', stageName: '', error: String(err) })}\n\n`,
      );
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  });

  return router;
}
