import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Deck from '../models/Deck.js';
import Card from '../models/Card.js';

await mongoose.connect(process.env.MONGODB_URI);
console.log('Connected to MongoDB');

const email = 'demo@example.com';
const password = 'demo1234';

await User.deleteOne({ email });
const user = await User.create({ email, passwordHash: await bcrypt.hash(password, 12) });
console.log(`Created user: ${email} / ${password}`);

const deck = await Deck.create({
  userId: user._id,
  name: 'Spanish Basics',
  sourceLang: 'en',
  targetLang: 'es',
  newPerDay: 20,
});
console.log(`Created deck: ${deck.name}`);

const words = [
  { front: 'hello', back: 'hola', exampleSentence: '¡Hola, cómo estás?' },
  { front: 'goodbye', back: 'adiós', exampleSentence: 'Adiós, hasta luego.' },
  { front: 'thank you', back: 'gracias', exampleSentence: 'Muchas gracias por tu ayuda.' },
  { front: 'water', back: 'agua', exampleSentence: 'Necesito un vaso de agua.' },
  { front: 'house', back: 'casa', exampleSentence: 'Mi casa es tu casa.' },
];

for (const w of words) {
  await Card.create({ ...w, deckId: deck._id, userId: user._id });
}
console.log(`Created ${words.length} cards`);

await mongoose.disconnect();
console.log('Done. Run: npm start');
