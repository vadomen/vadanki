import Event from '../models/Event.js';

// Structured one-line JSON logs → stdout (Render keeps 7 days on Hobby).
export function log(level, msg, fields = {}) {
  if (process.env.NODE_ENV === 'test') return;
  const line = JSON.stringify({ level, msg, ...fields });
  (level === 'error' ? console.error : console.log)(line);
}

// Diagnostic event → capped `events` collection in MongoDB (see models/Event.js).
// Fire-and-forget: never awaited by routes and never throws, so logging can't
// slow down or break a request. Returns the write promise for tests.
//
// Never put card text, emails, tokens or other personal content in `data` —
// ids, counts, grades and timings only.
export function logEvent(type, { userId = null, deckId = null, cardId = null, ...data } = {}) {
  if (process.env.EVENT_LOG === 'off') return Promise.resolve();
  return Event.create({ type, userId, deckId, cardId, data }).catch((err) =>
    log('error', 'event log write failed', { type, error: err.message }),
  );
}
