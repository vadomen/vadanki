// Read-only: print recent diagnostic events from the capped `events` collection.
// Usage: node scripts/events.js [--type study.queue] [--email you@example.com]
//                               [--deck <deckId>] [--limit 50]
import 'dotenv/config';
import mongoose from 'mongoose';
import Event from '../models/Event.js';
import User from '../models/User.js';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc),
      [],
    ),
);

await mongoose.connect(process.env.MONGODB_URI);

const filter = {};
if (args.type) filter.type = args.type;
if (args.deck) filter.deckId = args.deck;
if (args.email) {
  const user = await User.findOne({ email: args.email.toLowerCase() }).select('_id').lean();
  if (!user) {
    console.error(`No user with email ${args.email}`);
    process.exit(1);
  }
  filter.userId = user._id;
}

const events = await Event.find(filter)
  .sort({ $natural: -1 })
  .limit(Number(args.limit ?? 50))
  .lean();

for (const e of events.reverse()) {
  const { at, type, userId, deckId, cardId, data } = e;
  console.log(
    JSON.stringify({ at, type, userId, deckId, cardId, ...data }, (k, v) =>
      v === null ? undefined : v,
    ),
  );
}

const stats = await mongoose.connection.db.command({ collStats: 'events' }).catch(() => null);
if (stats) {
  console.error(
    `\n${events.length} shown · ${stats.count} stored · ${(stats.size / 1048576).toFixed(2)} / ${(stats.maxSize / 1048576).toFixed(0)} MB`,
  );
}

await mongoose.disconnect();
