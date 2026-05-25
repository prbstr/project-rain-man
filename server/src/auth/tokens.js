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

  const expiresAt = refreshExpiresAt();

  await prisma.refreshToken.create({
    data: { token, userId: user.id, expiresAt }
  });

  return token;
}

function refreshExpiresAt() {
  const expiresAt = new Date();
  const match = /^(\d+)([dhms])$/i.exec(process.env.JWT_REFRESH_EXPIRES_IN || '7d');
  if (!match) {
    expiresAt.setDate(expiresAt.getDate() + 7);
    return expiresAt;
  }
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'd') expiresAt.setDate(expiresAt.getDate() + n);
  else if (unit === 'h') expiresAt.setHours(expiresAt.getHours() + n);
  else if (unit === 'm') expiresAt.setMinutes(expiresAt.getMinutes() + n);
  else expiresAt.setSeconds(expiresAt.getSeconds() + n);
  return expiresAt;
}

export async function rotateRefreshToken(oldToken) {
  let payload;
  try {
    payload = jwt.verify(oldToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new Error('Invalid or expired refresh token');
  }

  // Atomic one-time use: deleteMany avoids P2025 on concurrent refresh/logout
  const { count } = await prisma.refreshToken.deleteMany({
    where: { token: oldToken, expiresAt: { gt: new Date() } },
  });
  if (count === 0) {
    throw new Error('Invalid or expired refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new Error('User not found');

  const newAccess = generateAccessToken(user);
  const newRefresh = await generateRefreshToken(user);

  return { accessToken: newAccess, refreshToken: newRefresh };
}
