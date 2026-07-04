import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Registration gets a much tighter cap: mass-created accounts are the main
// path to draining the Gemini quota. Skipped under test (supertest shares one IP).
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

function cookieOpts(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure, // true on HTTPS (Render sets trust proxy above)
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// Cloudflare Turnstile bot check on registration. Without TURNSTILE_SECRET_KEY
// (local dev, tests) registration stays open; with it, fail closed.
async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

// Public config the static frontend needs before login (no secrets here).
router.get('/config', (_req, res) => {
  res.json({ turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? null });
});

router.post('/register', authLimiter, registerLimiter, async (req, res) => {
  const { email, password, turnstileToken } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!(await verifyTurnstile(turnstileToken, req.ip)))
    return res.status(400).json({ error: 'CAPTCHA verification failed — please try again' });

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const user = await User.create({ email, passwordHash });
    res.cookie('token', signToken(user._id), cookieOpts(req));
    res.status(201).json({ userId: user._id });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    throw err;
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  res.cookie('token', signToken(user._id), cookieOpts(req));
  res.json({ userId: user._id });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId).select('email name isAdmin createdAt');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    userId: user._id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  });
});

router.patch('/me', requireAuth, authLimiter, async (req, res) => {
  const { name, email, currentPassword, newPassword } = req.body ?? {};

  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (newPassword !== undefined && newPassword !== '') {
    if (newPassword.length < 8)
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    user.passwordHash = await bcrypt.hash(newPassword, 12);
  }

  if (typeof name === 'string') user.name = name.trim();

  if (typeof email === 'string' && email.trim()) {
    user.email = email;
  } else if (email !== undefined && !String(email ?? '').trim()) {
    return res.status(400).json({ error: 'Email cannot be empty' });
  }

  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    throw err;
  }

  res.json({ userId: user._id, email: user.email, name: user.name });
});

export default router;
