import { Router } from "express";
import { OpenAICompatibleProvider } from "../../../core/src/providers/openai-compat.js";
import { PmAiService } from "../services/pm-ai/index.js";
import type { BoardConfig } from "../services/pm-ai/types.js";
import { DevAiService } from "../services/dev-ai/service.js";
import { DevAiTask } from "../services/dev-ai/index.js";

/** Seleziona il board provider da env. PM_BOARD_PROVIDER=plane|github (default: plane). */
function boardConfigFromEnv(): BoardConfig | undefined {
  const provider = (process.env["PM_BOARD_PROVIDER"] ?? "plane").toLowerCase();

  if (provider === "github") {
    const token = process.env["GITHUB_TOKEN"];
    const owner = process.env["GITHUB_OWNER"];
    if (!token || !owner) return undefined;
    return {
      provider: "github",
      config: { token, owner, baseUrl: process.env["GITHUB_API_BASE_URL"] },
    };
  }

  const apiKey = process.env["PLANE_API_KEY"];
  const workspaceSlug = process.env["PLANE_WORKSPACE_SLUG"];
  if (!apiKey || !workspaceSlug) return undefined;
  return {
    provider: "plane",
    config: {
      workspaceSlug,
      apiKey,
      baseUrl: process.env["PLANE_BASE_URL"],
      defaultOwnedBy: process.env["PLANE_OWNED_BY"],
    },
  };
}

export function createProjectsRouter(): Router {
  const router = Router();

  const openaiProvider = new OpenAICompatibleProvider({
    apiKey: process.env["OPENAI_API_KEY"] ?? "",
    baseURL: "https://api.openai.com/v1",
  });

  const pmAiService = new PmAiService(
    {
      openai: openaiProvider,
    },
    {
      board: boardConfigFromEnv(),
    },
  );

  const devAiService = new DevAiService(
    {
      analysis: openaiProvider,
      implementation: openaiProvider,
      review: openaiProvider,
      judge: openaiProvider,
    },
    {},
  );

  router.post("/", async (req, res) => {
    const documents: Buffer[] = req.body.documents.map((doc: string) =>
      Buffer.from(doc, "base64"),
    );
    pmAiService
      .createProject(documents)
      .then((result) => {
        res.status(200).json(result);
      })
      .catch((err) => {
        res.status(500).json({ error: String(err) });
      });
  });

  router.post("/:id/tasks/:taskId", async (req, res) => {
    const task: DevAiTask = req.body;
    devAiService
      .runTask(task)
      .then((result) => {
        res.status(200).json(result);
      })
      .catch((err) => {
        res.status(500).json({ error: String(err) });
      });
  });

  return router;
}
