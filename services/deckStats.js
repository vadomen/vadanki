import mongoose from 'mongoose';
import Card from '../models/Card.js';

// A card counts as learned only if its last review was Good or Easy;
// a single Hard or Again takes it back out.
export const LEARNED_GRADES = ['good', 'easy'];

// Per-deck breakdown by last grade: { easy, good, hard, again, unseen }.
// `unseen` = never shown in study. Cards reviewed before lastGrade existed
// are inferred from repetitions (> 0 → passed → good, 0 → lapsed → again);
// that approximation self-corrects as they get reviewed again.
export async function gradeBreakdown(deckId, userId) {
  const rows = await Card.aggregate([
    // aggregate() doesn't cast like find() does — cast ids explicitly
    {
      $match: {
        deckId: new mongoose.Types.ObjectId(String(deckId)),
        userId: new mongoose.Types.ObjectId(String(userId)),
      },
    },
    {
      $group: {
        _id: {
          $cond: [
            { $eq: [{ $ifNull: ['$lastReviewedAt', null] }, null] },
            'unseen',
            {
              $ifNull: ['$lastGrade', { $cond: [{ $gt: ['$repetitions', 0] }, 'good', 'again'] }],
            },
          ],
        },
        n: { $sum: 1 },
      },
    },
  ]);
  const out = { easy: 0, good: 0, hard: 0, again: 0, unseen: 0 };
  for (const r of rows) out[r._id] = r.n;
  return out;
}

// Cards introduced (first reviewed) today — what the newPerDay cap limits.
export function countIntroducedToday(deckId, userId, todayStart) {
  return Card.countDocuments({ deckId, userId, introducedAt: { $gte: todayStart } });
}

// Never-reviewed cards still waiting in the deck.
export function newCardsFilter(deckId, userId) {
  return { deckId, userId, repetitions: 0, lastReviewedAt: null };
}
