import { PrismaClient } from '../../generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// @ts-ignore - Prisma 7 type issue with constructor
export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
