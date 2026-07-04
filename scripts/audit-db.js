// Read-only data audit: reports inconsistencies without modifying anything.
// Usage: node scripts/audit-db.js
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Deck from '../models/Deck.js';
import Card from '../models/Card.js';

await mongoose.connect(process.env.MONGODB_URI);

const users = await User.find().lean();
const decks = await Deck.find().lean();
const cards = await Card.find().lean();

const userIds = new Set(users.map((u) => String(u._id)));
const deckById = new Map(decks.map((d) => [String(d._id), d]));

const issues = {};
const add = (key, item) => (issues[key] ??= []).push(item);

for (const d of decks) {
  const id = String(d._id);
  if (!d.userId || !userIds.has(String(d.userId))) add('decks: orphaned (no such user)', id);
  if (!d.name || !d.name.trim()) add('decks: empty name', id);
  if (typeof d.newPerDay !== 'number' || d.newPerDay < 1 || d.newPerDay > 200)
    add('decks: invalid newPerDay', `${id} (${d.newPerDay})`);
  if (!d.sourceLang || !d.targetLang)
    add('decks: missing langs', `${id} (${d.sourceLang}/${d.targetLang})`);
}

for (const c of cards) {
  const id = String(c._id);
  const deck = deckById.get(String(c.deckId));
  if (!deck) add('cards: orphaned (no such deck)', id);
  else if (String(c.userId) !== String(deck.userId))
    add('cards: userId differs from deck userId', id);
  if (!c.userId || !userIds.has(String(c.userId))) add('cards: orphaned (no such user)', id);
  if (!c.front || !c.front.trim()) add('cards: empty front', id);
  else if (c.front !== c.front.trim()) add('cards: untrimmed front', id);
  if (/^(null|undefined)$/i.test((c.back ?? '').trim()))
    add('cards: back is "null"/"undefined" text', id);
  if (/\b(undefined|null)\b/.test(c.back ?? '') && /<b>/.test(c.back ?? ''))
    add('cards: AI artifact in back', `${id} (${c.back.slice(0, 60)})`);
  // back legitimately holds HTML (entities render fine there) - only flag nbsp.
  for (const f of ['front', 'exampleSentence']) {
    if (/&(nbsp|amp|lt|gt|quot|#\d+);/i.test(c[f] ?? '') || /\u00A0/.test(c[f] ?? ''))
      add(`cards: HTML entity or nbsp in ${f}`, `${id} (${(c[f] ?? '').slice(0, 40)})`);
  }
  if (/&nbsp;|\u00A0/.test(c.back ?? '')) add('cards: nbsp in back', id);
  if (typeof c.ease !== 'number' || c.ease < 1.3) add('cards: ease below 1.3', `${id} (${c.ease})`);
  if (typeof c.repetitions !== 'number' || c.repetitions < 0)
    add('cards: negative/missing repetitions', `${id} (${c.repetitions})`);
  if (typeof c.interval !== 'number' || c.interval < 0)
    add('cards: negative/missing interval', `${id} (${c.interval})`);
  if (c.repetitions > 0 && !c.lastReviewedAt)
    add('cards: reviewed (reps>0) but lastReviewedAt null', id);
  if (c.repetitions > 0 && !c.dueDate) add('cards: reviewed but dueDate null', id);
}

const emails = new Map();
for (const u of users) {
  const e = (u.email ?? '').toLowerCase().trim();
  if (!e) add('users: empty email', String(u._id));
  if (emails.has(e)) add('users: duplicate email', `${e} (${emails.get(e)}, ${u._id})`);
  emails.set(e, String(u._id));
  if (!u.passwordHash) add('users: missing passwordHash', String(u._id));
}

console.log(`Scanned: ${users.length} users, ${decks.length} decks, ${cards.length} cards\n`);
const keys = Object.keys(issues);
if (keys.length === 0) {
  console.log('✅ No inconsistencies found.');
} else {
  for (const k of keys) {
    console.log(`❌ ${k} — ${issues[k].length}`);
    for (const item of issues[k].slice(0, 10)) console.log(`   ${item}`);
    if (issues[k].length > 10) console.log(`   … and ${issues[k].length - 10} more`);
    console.log();
  }
}

await mongoose.disconnect();
