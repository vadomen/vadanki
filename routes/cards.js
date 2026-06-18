import express from 'express';
import Card from '../models/Card.js';
import { requireAuth } from '../middleware/auth.js';

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
