import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import authRouter from './routes/auth.js';
import decksRouter from './routes/decks.js';
import cardsRouter from './routes/cards.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/decks', decksRouter);
app.use('/api/cards', cardsRouter);
// app.use('/api/study', studyRouter);

const PORT = process.env.PORT ?? 3000;

if (process.env.NODE_ENV !== 'test') {
  await connectDB();
  app.listen(PORT, () => console.log(`Listening on :${PORT}`));
}

export default app;
