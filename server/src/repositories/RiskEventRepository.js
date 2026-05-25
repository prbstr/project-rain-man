import { prisma } from '../db/client.js';

export async function create({ userId, type, details }) {
  return prisma.riskEvent.create({
    data: { userId, type, details: details ?? {} }
  });
}

export async function findByUser(userId, limit = 50) {
  return prisma.riskEvent.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
