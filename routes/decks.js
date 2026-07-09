import express from 'express';
import { rateLimit } from 'express-rate-limit';
import Deck from '../models/Deck.js';
import Card from '../models/Card.js';
import { requireAuth } from '../middleware/auth.js';
import { translateWord } from '../services/geminiService.js';
import { tryConsumeAiQuota, AI_MAX_FRONT_LENGTH } from '../services/aiQuota.js';
import { serializeCSV, parseCSV } from '../services/csv.js';

const router = express.Router();
router.use(requireAuth);

// GET /api/decks — list decks with new/due/total card counts
router.get('/', async (req, res) => {
  const decks = await Deck.find({ userId: req.userId }).lean();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const counts = await Promise.all(
    decks.map(async (deck) => {
      const [total, due, newToday, learned] = await Promise.all([
        Card.countDocuments({ deckId: deck._id, userId: req.userId }),
        Card.countDocuments({
          deckId: deck._id,
          userId: req.userId,
          dueDate: { $lte: now },
          repetitions: { $gt: 0 },
        }),
        Card.countDocuments({
          deckId: deck._id,
          userId: req.userId,
          createdAt: { $gte: todayStart },
        }),
        // "Learned" = last grade good/easy. Cards reviewed before lastGrade
        // existed (null but repetitions > 0) count too — SM-2 resets
        // repetitions on "again", so they passed their last review; the
        // approximation self-corrects as cards get reviewed again.
        Card.countDocuments({
          deckId: deck._id,
          userId: req.userId,
          $or: [
            { lastGrade: { $in: ['good', 'easy'] } },
            { lastGrade: null, repetitions: { $gt: 0 } },
          ],
        }),
      ]);
      return { ...deck, total, due, newToday, learned };
    }),
  );

  res.json(counts);
});

// POST /api/decks — create deck
router.post('/', async (req, res) => {
  const { name, sourceLang, targetLang, newPerDay } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const deck = await Deck.create({ userId: req.userId, name, sourceLang, targetLang, newPerDay });
  res.status(201).json(deck);
});

// PATCH /api/decks/:id — update deck settings
router.patch('/:id', async (req, res) => {
  const { name, sourceLang, targetLang, newPerDay } = req.body ?? {};
  const deck = await Deck.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $set: { name, sourceLang, targetLang, newPerDay } },
    { new: true, runValidators: true },
  );
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  res.json(deck);
});

// DELETE /api/decks/:id — delete deck and all its cards
router.delete('/:id', async (req, res) => {
  const deck = await Deck.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  await Card.deleteMany({ deckId: deck._id, userId: req.userId });
  res.json({ ok: true });
});

// GET /api/decks/:id/cards — list cards in deck
router.get('/:id/cards', async (req, res) => {
  const deck = await Deck.findOne({ _id: req.params.id, userId: req.userId });
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  const cards = await Card.find({ deckId: deck._id, userId: req.userId }).sort({ createdAt: -1 });
  res.json(cards);
});

// Keyed per user (requireAuth runs first), so bots rotating IPs on one stolen
// account stay limited, and users behind a shared NAT don't block each other.
const cardCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.userId),
});

// POST /api/decks/:id/cards — create card; calls Gemini for translation + example
router.post('/:id/cards', cardCreateLimiter, async (req, res) => {
  const deck = await Deck.findOne({ _id: req.params.id, userId: req.userId });
  if (!deck) return res.status(404).json({ error: 'Deck not found' });

  const { front, back, exampleSentence } = req.body ?? {};
  if (!front) return res.status(400).json({ error: 'front required' });

  // Call Gemini only when back is not manually provided
  let resolvedBack = back ?? '';
  let aiFailed = false;
  let aiLimited = false;
  if (!resolvedBack && process.env.GEMINI_API_KEY && front.length <= AI_MAX_FRONT_LENGTH) {
    if (await tryConsumeAiQuota(req.userId)) {
      const ai = await translateWord(front, deck.sourceLang, deck.targetLang);
      if (ai?.translation) {
        const t = ai.translation.trim();
        const ex = (ai.exampleSentence ?? '').trim();
        resolvedBack = ex ? `<b>${t}</b><br><i>${ex}</i>` : `<b>${t}</b>`;
      } else {
        aiFailed = true;
      }
    } else {
      aiFailed = true;
      aiLimited = true;
    }
  }

  const card = await Card.create({
    deckId: deck._id,
    userId: req.userId,
    front,
    back: resolvedBack,
    exampleSentence: exampleSentence ?? '',
  });
  res.status(201).json({ ...card.toJSON(), aiFailed, aiLimited });
});

// GET /api/decks/:id/export.csv — download all cards as CSV
router.get('/:id/export.csv', async (req, res) => {
  const deck = await Deck.findOne({ _id: req.params.id, userId: req.userId });
  if (!deck) return res.status(404).json({ error: 'Deck not found' });

  const cards = await Card.find({ deckId: deck._id, userId: req.userId }).sort({ createdAt: 1 });
  const csv = serializeCSV(cards);
  const safeName = deck.name.replace(/[^a-z0-9_-]/gi, '_');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
  res.send(csv);
});

// POST /api/decks/:id/import — create cards from CSV body { csv: "..." }
router.post('/:id/import', async (req, res) => {
  const deck = await Deck.findOne({ _id: req.params.id, userId: req.userId });
  if (!deck) return res.status(404).json({ error: 'Deck not found' });

  const { csv } = req.body ?? {};
  if (!csv || typeof csv !== 'string')
    return res.status(400).json({ error: 'csv string required' });

  const rows = parseCSV(csv);
  if (rows.length === 0) return res.status(400).json({ error: 'CSV is empty' });

  // Skip header row if present
  const start = rows[0][0]?.toLowerCase().trim() === 'front' ? 1 : 0;
  const dataRows = rows.slice(start).filter((r) => r[0]?.trim());

  if (dataRows.length === 0) return res.status(400).json({ error: 'No valid rows found' });
  if (dataRows.length > 1000) return res.status(400).json({ error: 'Max 1000 cards per import' });

  const docs = dataRows.map(([front = '', back = '', exampleSentence = '']) => ({
    deckId: deck._id,
    userId: req.userId,
    front: front.trim(),
    back: back.trim(),
    exampleSentence: exampleSentence.trim(),
  }));

  const cards = await Card.insertMany(docs);
  res.status(201).json({ imported: cards.length });
});

export default router;
