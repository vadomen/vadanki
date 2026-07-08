import AiUsage from '../models/AiUsage.js';

// Longest front we'll send to Gemini — real words/phrases fit; junk doesn't.
export const AI_MAX_FRONT_LENGTH = 200;

const userLimit = () => Number(process.env.AI_DAILY_LIMIT_USER ?? 50);
const globalLimit = () => Number(process.env.AI_DAILY_LIMIT_GLOBAL ?? 500);

async function increment(key, date) {
  // Two concurrent upserts on a missing doc can both try to insert; retry the
  // loser once — the doc exists by then, so the $inc path succeeds.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await AiUsage.findOneAndUpdate(
        { key, date },
        { $inc: { count: 1 } },
        { upsert: true, new: true },
      );
    } catch (err) {
      if (err.code !== 11000 || attempt === 1) throw err;
    }
  }
}

// Atomically consume one AI call from both the per-user and the global daily
// budget. Returns false when either budget is exhausted (counters still
// increment, which only over-counts denials — never allows extra calls).
export async function tryConsumeAiQuota(userId) {
  const date = new Date().toISOString().slice(0, 10);
  const [user, global] = await Promise.all([
    increment(String(userId), date),
    increment('global', date),
  ]);
  return user.count <= userLimit() && global.count <= globalLimit();
}
