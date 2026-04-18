import { Router } from 'express';
import { register, login, verifyToken } from '../services/auth.js';
import { getUser } from '../services/user.js';

const router = Router();

router.post('/auth/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!username || username.trim().length < 1) {
      return res.status(400).json({ error: 'Username is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const result = await register(email, username.trim(), password);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const result = await login(email, password);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

router.get('/auth/me', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const payload = verifyToken(auth.slice(7));
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  const user = getUser(payload.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  res.json({ user });
});

export default router;
