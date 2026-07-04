import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/make-admin.js <email> [--revoke]');
  process.exit(1);
}
const isAdmin = !process.argv.includes('--revoke');

await mongoose.connect(process.env.MONGODB_URI);
const user = await User.findOneAndUpdate(
  { email: email.toLowerCase().trim() },
  { $set: { isAdmin } },
  { new: true },
);
console.log(
  user ? `${user.email} — isAdmin: ${user.isAdmin}` : `No user found with email ${email}`,
);
await mongoose.disconnect();
process.exit(user ? 0 : 1);
