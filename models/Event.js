import mongoose from 'mongoose';

// Capped collection: MongoDB keeps only the newest ~10 MB of events and
// silently drops the oldest — no cleanup job, bounded Atlas storage.
export const EVENTS_MAX_BYTES = 10 * 1024 * 1024;

const { ObjectId, Mixed } = mongoose.Schema.Types;

const eventSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    type: { type: String, required: true },
    userId: { type: ObjectId, ref: 'User', default: null },
    deckId: { type: ObjectId, ref: 'Deck', default: null },
    cardId: { type: ObjectId, ref: 'Card', default: null },
    data: { type: Mixed, default: {} },
  },
  { versionKey: false, capped: { size: EVENTS_MAX_BYTES } },
);

eventSchema.index({ userId: 1, at: -1 });

export default mongoose.model('Event', eventSchema);
