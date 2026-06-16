import { Router } from "express";
import { OpenAICompatibleProvider } from "../../../core/src/providers/openai-compat.js";
import fs from "fs";
import { PmAiService } from "../services/pm-ai/index.js";

export function createProjectsRouter(): Router {
    const router = Router();
    const pmAiService = new PmAiService({
        openai: new OpenAICompatibleProvider({
            apiKey: process.env["OPENAI_API_KEY"] ?? "",
            baseURL: "https://api.openai.com/v1",
        })
    }, {
        plane: {
            workspaceSlug: process.env["PLANE_WORKSPACE_SLUG"] ?? "",
            apiKey: process.env["PLANE_API_KEY"] ?? "",
            baseUrl: process.env["PLANE_BASE_URL"],
            defaultOwnedBy: process.env["PLANE_OWNED_BY"],
        }
    });

    // POST /api/projects — crea nuovo progetto
    router.post('/', async (req, res) => {
        const documents: Buffer[] = req.body.documents.map((doc: string) => Buffer.from(doc, 'base64'));
        pmAiService.createProject(documents).then(result => {
            res.status(200).json(result);
        }).catch(err => {
            res.status(500).json({ error: String(err) });
        });
    });

    // POST /api/projects — crea nuovo progetto
    router.post('/test', async (req, res) => {
        const documents: Buffer[] = [fs.readFileSync('tests\\files\\Analisi_Funzionale_Repricer_MediaWorld_Mirakl.pdf')];
        pmAiService.createProject(documents).then(result => {
            res.status(200).json(result);
        }).catch(err => {
            res.status(500).json({ error: String(err) });
        });
    });
    return router;
}
