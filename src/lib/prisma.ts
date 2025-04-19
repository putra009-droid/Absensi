// src/lib/prisma.ts (Pastikan file ini ada dan isinya seperti ini)
import { PrismaClient } from '@prisma/client';

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    // log: ['query'], // Bisa di-uncomment untuk melihat query Prisma di console saat development
  });

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;