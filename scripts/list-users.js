import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';

await mongoose.connect(process.env.MONGODB_URI);
const users = await User.find({}, 'email createdAt').sort({ createdAt: 1 });
users.forEach((u) => console.log(u.createdAt.toISOString().slice(0, 16), u.email));
await mongoose.disconnect();
