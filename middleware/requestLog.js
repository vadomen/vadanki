import { log } from '../services/eventLog.js';

// One JSON line per API request: method, path, status, duration, user.
// Static files and /healthz pings are skipped to keep the log readable.
export function requestLog(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e5) / 10;
    const status = res.statusCode;
    log(status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', 'request', {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status,
      ms,
      userId: req.userId ? String(req.userId) : undefined,
    });
  });
  next();
}
