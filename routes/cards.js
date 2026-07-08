import express from 'express';
import { rateLimit } from 'express-rate-limit';
import Card from '../models/Card.js';
import Deck from '../models/Deck.js';
import { requireAuth } from '../middleware/auth.js';
import { translateWord } from '../services/geminiService.js';
import { tryConsumeAiQuota, AI_MAX_FRONT_LENGTH } from '../services/aiQuota.js';

const router = express.Router();
router.use(requireAuth);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/cards/search?q= — find the user's existing cards by front/back text.
// Registered before /:id so the literal path isn't swallowed by the id route.
router.get('/search', async (req, res) => {
  const q = (req.query.q ?? '').trim();
  if (q.length < 2) return res.json([]);

  const rx = new RegExp(escapeRegex(q), 'i');
  const cards = await Card.find({
    userId: req.userId,
    $or: [{ front: rx }, { back: rx }],
  })
    .sort({ createdAt: -1 })
    .limit(8)
    .populate('deckId', 'name')
    .lean();

  res.json(
    cards.map((c) => ({
      _id: c._id,
      front: c.front,
      back: c.back,
      deckId: c.deckId?._id ?? c.deckId,
      deckName: c.deckId?.name ?? '',
    })),
  );
});

// Same per-user cap as card creation — both endpoints spend Gemini calls.
const regenerateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.userId),
});

// POST /api/cards/:id/regenerate — re-run the AI translation for a card.
// Unlike create, AI failure is an error here (there's nothing else to do).
router.post('/:id/regenerate', regenerateLimiter, async (req, res) => {
  const card = await Card.findOne({ _id: req.params.id, userId: req.userId });
  if (!card) return res.status(404).json({ error: 'Card not found' });

  if (!process.env.GEMINI_API_KEY)
    return res.status(503).json({ error: 'AI translation is not configured' });
  if (card.front.length > AI_MAX_FRONT_LENGTH)
    return res.status(400).json({ error: 'Front text is too long for AI translation' });
  if (!(await tryConsumeAiQuota(req.userId)))
    return res.status(429).json({ error: 'Daily AI limit reached — try again tomorrow' });

  const deck = await Deck.findOne({ _id: card.deckId, userId: req.userId });
  const ai = await translateWord(card.front, deck?.sourceLang ?? 'en', deck?.targetLang ?? 'es');
  if (!ai?.translation)
    return res.status(502).json({ error: 'AI is unavailable right now — try again later' });

  const t = ai.translation.trim();
  const ex = (ai.exampleSentence ?? '').trim();
  card.back = ex ? `<b>${t}</b><br><i>${ex}</i>` : `<b>${t}</b>`;
  await card.save();
  res.json(card);
});

// PATCH /api/cards/:id — edit card fields
router.patch('/:id', async (req, res) => {
  const { front, back, exampleSentence } = req.body ?? {};
  const card = await Card.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $set: { front, back, exampleSentence } },
    { new: true, runValidators: true },
  );
  if (!card) return res.status(404).json({ error: 'Card not found' });
  res.json(card);
});

// GET /api/cards/:id — get card details
router.get('/:id', async (req, res) => {
  const card = await Card.findOne({ _id: req.params.id, userId: req.userId });
  if (!card) return res.status(404).json({ error: 'Card not found' });
  res.json(card);
});

// DELETE /api/cards/:id — delete card
router.delete('/:id', async (req, res) => {
  const card = await Card.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!card) return res.status(404).json({ error: 'Card not found' });
  res.json({ ok: true });
});

export default router;
