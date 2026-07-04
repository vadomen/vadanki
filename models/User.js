import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true, maxlength: 100, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default mongoose.model('User', userSchema);
