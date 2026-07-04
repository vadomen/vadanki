import mongoose from 'mongoose';

const cardSchema = new mongoose.Schema(
  {
    deckId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deck', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    front: { type: String, required: true, trim: true },
    back: { type: String, default: '', trim: true },
    exampleSentence: { type: String, default: '', trim: true },
    ease: { type: Number, default: 2.5 },
    interval: { type: Number, default: 0 },
    repetitions: { type: Number, default: 0 },
    dueDate: { type: Date, default: Date.now },
    lastReviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

cardSchema.index({ userId: 1, deckId: 1, dueDate: 1 });

export default mongoose.model('Card', cardSchema);
