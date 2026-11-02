import express from 'express';
import Card from '../models/Card.js';
import Deck from '../models/Deck.js';
import { requireAuth } from '../middleware/auth.js';
import { applyGrade } from '../services/sm2.js';
import { startOfDay } from '../services/day.js';
import { countIntroducedToday, newCardsFilter } from '../services/deckStats.js';
import { logEvent } from '../services/eventLog.js';

const router = express.Router();
router.use(requireAuth);

// GET /api/study/:deckId — next batch of due + new cards
router.get('/:deckId', async (req, res) => {
  const deck = await Deck.findOne({ _id: req.params.deckId, userId: req.userId });
  if (!deck) return res.status(404).json({ error: 'Deck not found' });

  const now = new Date();
  const todayStart = startOfDay(now);

  // Due cards (already reviewed at least once, overdue). Keyed off
  // lastReviewedAt, not repetitions: SM-2 resets repetitions to 0 on "again",
  // so a lapsed card would otherwise match neither this query nor the new-card
  // query below and drop out of study forever.
  const due = await Card.find({
    deckId: deck._id,
    userId: req.userId,
    dueDate: { $lte: now },
    lastReviewedAt: { $ne: null },
  }).sort({ dueDate: 1 });

  // New cards introduced (first reviewed) today so far, whenever they were
  // created. Keyed off introducedAt so due reviews don't eat the new-card cap.
  const introducedToday = await countIntroducedToday(deck._id, req.userId, todayStart);

  const newSlots = Math.max(0, deck.newPerDay - introducedToday);

  // New cards (never reviewed), capped by remaining daily quota. Skip the
  // query at 0: MongoDB treats limit(0) as "no limit" and would return every
  // new card in the deck once the daily cap is reached.
  const newCards =
    newSlots > 0
      ? await Card.find(newCardsFilter(deck._id, req.userId)).sort({ createdAt: 1 }).limit(newSlots)
      : [];

  logEvent('study.queue', {
    userId: req.userId,
    deckId: deck._id,
    due: due.length,
    newServed: newCards.length,
    newSlots,
    newPerDay: deck.newPerDay,
    introducedToday,
  });

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

  const firstReview = !card.lastReviewedAt;
  const before = { repetitions: card.repetitions, interval: card.interval, ease: card.ease };
  const updates = applyGrade(card, grade);
  Object.assign(card, updates);
  card.lastGrade = grade;
  if (firstReview) card.introducedAt = updates.lastReviewedAt;
  await card.save();

  logEvent('study.review', {
    userId: req.userId,
    deckId: card.deckId,
    cardId: card._id,
    grade,
    firstReview,
    before,
    after: { repetitions: card.repetitions, interval: card.interval, ease: card.ease },
  });

  res.json(card);
});

export default router;
