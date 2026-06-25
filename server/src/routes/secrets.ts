import { Router } from "express";
import { SecretsService } from "../secrets/index.js";

function getService(res: import("express").Response): SecretsService | null {
  try {
    return SecretsService.get();
  } catch {
    res
      .status(503)
      .json({ error: "Secrets not initialized. Set SECRETS_KEY env var." });
    return null;
  }
}

export function createSecretsRouter(): Router {
  const router = Router();

  /** GET /api/secrets — returns key names only, never values. */
  router.get("/", (_req, res) => {
    const svc = getService(res);
    if (!svc) return;
    res.json({ keys: svc.list() });
  });

  /** POST /api/secrets — body: { key, value } */
  router.post("/", (req, res) => {
    const { key, value } = req.body as { key?: string; value?: string };
    if (!key || !value) {
      res.status(400).json({ error: "key and value are required" });
      return;
    }
    const svc = getService(res);
    if (!svc) return;
    svc.set(key, value);
    res.json({ ok: true });
  });

  /** DELETE /api/secrets/:key */
  router.delete("/:key", (req, res) => {
    const svc = getService(res);
    if (!svc) return;
    const deleted = svc.delete(req.params["key"]!);
    if (!deleted) {
      res.status(404).json({ error: `Secret "${req.params["key"]}" not found` });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
