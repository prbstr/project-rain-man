import jwt from 'jsonwebtoken';
import { prisma } from '../db/client.js';

export function generateAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
}

export async function generateRefreshToken(user) {
  const token = jwt.sign(
    { sub: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: { token, userId: user.id, expiresAt }
  });

  return token;
}

export async function rotateRefreshToken(oldToken) {
  const stored = await prisma.refreshToken.findUnique({ where: { token: oldToken } });
  if (!stored || stored.expiresAt < new Date()) {
    throw new Error('Invalid or expired refresh token');
  }

  // Verify signature
  const payload = jwt.verify(oldToken, process.env.JWT_REFRESH_SECRET);

  // Delete old token (rotation — one use only)
  await prisma.refreshToken.delete({ where: { token: oldToken } });

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new Error('User not found');

  const newAccess = generateAccessToken(user);
  const newRefresh = await generateRefreshToken(user);

  return { accessToken: newAccess, refreshToken: newRefresh };
}
