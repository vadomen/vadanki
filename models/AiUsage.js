import mongoose from 'mongoose';

// Daily AI-call counters: key is a userId or 'global', date is YYYY-MM-DD (UTC).
const aiUsageSchema = new mongoose.Schema({
  key: { type: String, required: true },
  date: { type: String, required: true },
  count: { type: Number, default: 0 },
});

aiUsageSchema.index({ key: 1, date: 1 }, { unique: true });

export default mongoose.model('AiUsage', aiUsageSchema);
