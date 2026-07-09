import mongoose from 'mongoose';

// Pasted/imported text often carries non-breaking spaces as a literal
// "&nbsp;" entity or a U+00A0 character — normalize both to plain spaces.
const cleanText = (s) =>
  typeof s === 'string' ? s.replace(/&nbsp;?/gi, ' ').replace(/\u00A0/g, ' ') : s;

const cardSchema = new mongoose.Schema(
  {
    deckId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deck', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    front: { type: String, required: true, trim: true, set: cleanText },
    back: { type: String, default: '', trim: true, set: cleanText },
    exampleSentence: { type: String, default: '', trim: true, set: cleanText },
    ease: { type: Number, default: 2.5 },
    interval: { type: Number, default: 0 },
    repetitions: { type: Number, default: 0 },
    dueDate: { type: Date, default: Date.now },
    lastReviewedAt: { type: Date, default: null },
    lastGrade: { type: String, enum: ['again', 'hard', 'good', 'easy'], default: null },
  },
  { timestamps: true },
);

cardSchema.index({ userId: 1, deckId: 1, dueDate: 1 });

export default mongoose.model('Card', cardSchema);
