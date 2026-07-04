import express from 'express';
import Card from '../models/Card.js';
import Deck from '../models/Deck.js';
import { requireAuth } from '../middleware/auth.js';
import { applyGrade } from '../services/sm2.js';

const router = express.Router();
router.use(requireAuth);

// GET /api/study/:deckId — next batch of due + new cards
router.get('/:deckId', async (req, res) => {
  const deck = await Deck.findOne({ _id: req.params.deckId, userId: req.userId });
  if (!deck) return res.status(404).json({ error: 'Deck not found' });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Due cards (already reviewed at least once, overdue)
  const due = await Card.find({
    deckId: deck._id,
    userId: req.userId,
    dueDate: { $lte: now },
    repetitions: { $gt: 0 },
  }).sort({ dueDate: 1 });

  // New cards introduced today so far
  const newSeenToday = await Card.countDocuments({
    deckId: deck._id,
    userId: req.userId,
    repetitions: { $gt: 0 },
    lastReviewedAt: { $gte: todayStart },
    createdAt: { $gte: todayStart },
  });

  const newSlots = Math.max(0, deck.newPerDay - newSeenToday);

  // New cards (never reviewed), capped by remaining daily quota
  const newCards = await Card.find({
    deckId: deck._id,
    userId: req.userId,
    repetitions: 0,
    lastReviewedAt: null,
  })
    .sort({ createdAt: 1 })
    .limit(newSlots);

  res.json({
    due,
    new: newCards,
    deck: { sourceLang: deck.sourceLang, targetLang: deck.targetLang },
  });
});

// POST /api/study/:cardId/review — grade a card
router.post('/:cardId/review', async (req, res) => {
  const { grade } = req.body ?? {};
  if (!['again', 'hard', 'good', 'easy'].includes(grade)) {
    return res.status(400).json({ error: 'grade must be again|hard|good|easy' });
  }

  const card = await Card.findOne({ _id: req.params.cardId, userId: req.userId });
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const updates = applyGrade(card, grade);
  Object.assign(card, updates);
  await card.save();

  res.json(card);
});

export default router;
