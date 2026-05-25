import { z } from 'zod';
import { authService } from '../services/AuthService.js';
import { refreshTokenRepository } from '../repositories/RefreshTokenRepository.js';

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export class AuthController {
  async register(req, res, next) {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const result = await authService.register(
        parsed.data.email,
        parsed.data.username,
        parsed.data.password
      );

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async login(req, res, next) {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const result = await authService.login(parsed.data.email, parsed.data.password);

      res.json(result);
    } catch (err) {
      if (err.message === 'Invalid credentials') {
        return res.status(401).json({ error: err.message });
      }
      next(err);
    }
  }

  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
      }

      const result = await authService.refresh(refreshToken);
      res.json(result);
    } catch (err) {
      if (err.message.includes('Invalid') || err.message.includes('Expired')) {
        return res.status(403).json({ error: err.message });
      }
      next(err);
    }
  }

  async logout(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await refreshTokenRepository.deleteByToken(refreshToken).catch(() => {});
      }
      res.json({ message: 'Logged out' });
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
