import express from 'express';
import User from '../models/User.js';
import Deck from '../models/Deck.js';
import Card from '../models/Card.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

// GET /api/admin/users — all users with their decks and card counts.
// Admin-only exception to the userId-scoping invariant (see CLAUDE.md).
router.get('/users', async (_req, res) => {
  const [users, decks, cardCounts] = await Promise.all([
    User.find({}, 'email name isAdmin createdAt').sort({ createdAt: 1 }).lean(),
    Deck.find({}, 'userId name sourceLang targetLang createdAt').sort({ createdAt: 1 }).lean(),
    Card.aggregate([{ $group: { _id: '$deckId', count: { $sum: 1 } } }]),
  ]);

  const countByDeck = Object.fromEntries(cardCounts.map((c) => [String(c._id), c.count]));
  const decksByUser = {};
  for (const deck of decks) {
    const key = String(deck.userId);
    (decksByUser[key] ??= []).push({
      _id: deck._id,
      name: deck.name,
      sourceLang: deck.sourceLang,
      targetLang: deck.targetLang,
      createdAt: deck.createdAt,
      cardCount: countByDeck[String(deck._id)] ?? 0,
    });
  }

  res.json(
    users.map((u) => {
      const userDecks = decksByUser[String(u._id)] ?? [];
      return {
        _id: u._id,
        email: u.email,
        name: u.name ?? '',
        isAdmin: u.isAdmin ?? false,
        createdAt: u.createdAt,
        decks: userDecks,
        totalCards: userDecks.reduce((sum, d) => sum + d.cardCount, 0),
      };
    }),
  );
});

export default router;
