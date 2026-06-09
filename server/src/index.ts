import express from 'express';
import cors from 'cors';
import { JsonFileStorage } from './storage/json-files.js';
import { createPipelinesRouter } from './routes/pipelines.js';

const PORT = process.env['PORT'] ? parseInt(process.env['PORT']) : 3001;

const storage = new JsonFileStorage();
const app = express();

app.use(cors({ origin: process.env['CLIENT_ORIGIN'] ?? 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/pipelines', createPipelinesRouter(storage));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
