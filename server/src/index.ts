import express from 'express';
import cors from 'cors';
import { JsonFileStorage } from './storage/json-files.js';
import { createPipelinesRouter } from './routes/pipelines.js';
import { createProjectsRouter } from './routes/projects.js';
import { createSecretsRouter } from './routes/secrets.js';
import { SecretsService } from './secrets/index.js';
import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env['PORT'] ? parseInt(process.env['PORT']) : 3001;

const secretsKey = process.env['SECRETS_KEY'];
if (secretsKey) {
  SecretsService.init(secretsKey);
}

const storage = new JsonFileStorage();
const app = express();

app.use(cors({ origin: process.env['CLIENT_ORIGIN'] ?? 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/pipelines', createPipelinesRouter(storage));
app.use('/api/projects', createProjectsRouter());
app.use('/api/secrets', createSecretsRouter());

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
