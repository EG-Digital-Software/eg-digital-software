import { PrismaClient } from '@prisma/client';
import { isProd } from './env.js';

export const prisma = new PrismaClient({
  log: isProd ? ['error', 'warn'] : ['error', 'warn'],
});

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
