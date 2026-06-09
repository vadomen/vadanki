import express from 'express';
import Card from '../models/Card.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

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

// DELETE /api/cards/:id — delete card
router.delete('/:id', async (req, res) => {
  const card = await Card.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!card) return res.status(404).json({ error: 'Card not found' });
  res.json({ ok: true });
});

export default router;
