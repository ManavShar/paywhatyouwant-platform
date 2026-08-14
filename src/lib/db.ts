import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 connects through a driver adapter rather than a `url` in the schema.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Next.js hot-reloads modules in development, which would otherwise open a new
// pool on every edit until Postgres refuses connections. Cache on globalThis.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
