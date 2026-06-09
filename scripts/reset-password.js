import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const [, , email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error('Usage: node scripts/reset-password.js <email> <new-password>');
  process.exit(1);
}

if (newPassword.length < 8) {
  console.error('Password must be at least 8 characters');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
const user = await User.findOne({ email: email.toLowerCase().trim() });

if (!user) {
  console.error(`No user found with email: ${email}`);
  await mongoose.disconnect();
  process.exit(1);
}

user.passwordHash = await bcrypt.hash(newPassword, 12);
await user.save();
console.log(`✅ Password reset for ${user.email}`);
await mongoose.disconnect();
