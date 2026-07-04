import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.userId = jwt.verify(token, process.env.JWT_SECRET).userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Checked against the DB (not the JWT) so revoking admin takes effect immediately.
export async function requireAdmin(req, res, next) {
  const user = await User.findById(req.userId).select('isAdmin');
  if (!user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  next();
}
