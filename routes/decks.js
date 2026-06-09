import express from 'express';
import Deck from '../models/Deck.js';
import Card from '../models/Card.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET /api/decks — list decks with new/due/total card counts
router.get('/', async (req, res) => {
  const decks = await Deck.find({ userId: req.userId }).lean();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const counts = await Promise.all(
    decks.map(async (deck) => {
      const [total, due, newToday] = await Promise.all([
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
      ]);
      return { ...deck, total, due, newToday };
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

// POST /api/decks/:id/cards — create card (Gemini wired in M4)
router.post('/:id/cards', async (req, res) => {
  const deck = await Deck.findOne({ _id: req.params.id, userId: req.userId });
  if (!deck) return res.status(404).json({ error: 'Deck not found' });

  const { front, back, exampleSentence } = req.body ?? {};
  if (!front) return res.status(400).json({ error: 'front required' });

  const card = await Card.create({
    deckId: deck._id,
    userId: req.userId,
    front,
    back: back ?? '',
    exampleSentence: exampleSentence ?? '',
  });
  res.status(201).json(card);
});

export default router;
