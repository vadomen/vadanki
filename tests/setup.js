import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod;

export async function setup() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = 'test-secret';
  // .env is loaded by server.js — drop the real key so tests never call Gemini
  delete process.env.GEMINI_API_KEY;
  await mongoose.connect(process.env.MONGODB_URI);
}

export async function teardown() {
  await mongoose.disconnect();
  await mongod.stop();
}

export async function clearDB() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}
