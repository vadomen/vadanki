import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import authRouter from './routes/auth.js';
import decksRouter from './routes/decks.js';
import cardsRouter from './routes/cards.js';
import studyRouter from './routes/study.js';
import adminRouter from './routes/admin.js';
import { requestLog } from './middleware/requestLog.js';
import { log, logEvent } from './services/eventLog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Trust Render's reverse proxy so req.secure reflects HTTPS correctly
app.set('trust proxy', 1);

app.use(requestLog);
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/decks', decksRouter);
app.use('/api/cards', cardsRouter);
app.use('/api/study', studyRouter);
app.use('/api/admin', adminRouter);

// Central error handler: Express 5 forwards rejected async handlers here.
// Client errors (e.g. malformed JSON) keep their status and message; anything
// else is logged with its stack and answered with a generic 500.
app.use((err, req, res, _next) => {
  const status = Number.isInteger(err.status) && err.status >= 400 ? err.status : 500;
  const path = req.originalUrl.split('?')[0];
  if (status >= 500) {
    log('error', err.message, { method: req.method, path, stack: err.stack });
    logEvent('server.error', { userId: req.userId, method: req.method, path, error: err.message });
  }
  if (res.headersSent) return;
  res.status(status).json({ error: status < 500 ? err.message : 'Internal server error' });
});

const PORT = process.env.PORT ?? 3000;

if (process.env.NODE_ENV !== 'test') {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Listening on :${PORT}`);
    console.log(
      `AI translation: ${process.env.GEMINI_API_KEY ? 'enabled' : 'DISABLED — set GEMINI_API_KEY to enable'}`,
    );
  });
}

export default app;
