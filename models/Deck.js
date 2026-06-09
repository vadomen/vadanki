import mongoose from 'mongoose';

const deckSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    sourceLang: { type: String, default: 'en' },
    targetLang: { type: String, default: 'es' },
    newPerDay: { type: Number, default: 20 },
  },
  { timestamps: true },
);

export default mongoose.model('Deck', deckSchema);
