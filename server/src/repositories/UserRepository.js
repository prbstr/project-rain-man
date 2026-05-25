import { prisma } from '../db/client.js';

export class UserRepository {
  async findById(id) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, username: true, role: true, createdAt: true, settings: true }
    });
  }

  async findByEmail(email) {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  async findByEmailOrUsername(email, username) {
    return prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
  }

  async create(data) {
    return prisma.user.create({
      data,
    });
  }

  async update(id, data) {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  async delete(id) {
    return prisma.user.delete({
      where: { id },
    });
  }
}

export const userRepository = new UserRepository();
