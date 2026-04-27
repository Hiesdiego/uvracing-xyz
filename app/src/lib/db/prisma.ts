import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

/**
 * FIX: P1017 "Server has closed the connection"
 *
 * The previous code passed `{ connectionString }` directly to PrismaPg,
 * which created a pool with no timeout config. Neon/Supabase closes idle
 * connections after ~5 minutes of inactivity. Without an idleTimeoutMillis,
 * the pool holds on to stale connections indefinitely — and the next query
 * blocks for 57 seconds waiting for a dead socket before Prisma gives up.
 *
 * The fix: create the pg.Pool explicitly with:
 *  - idleTimeoutMillis: recycle connections before the DB closes them
 *  - connectionTimeoutMillis: fail fast rather than hanging forever
 *  - max: reasonable cap for Next.js (many short-lived lambda-style requests)
 *
 * If you're on Neon, also make sure DATABASE_URL uses the POOLED endpoint
 * (the one with ?pgbouncer=true or the pooler subdomain), not the direct
 * connection string. Direct connections get killed by Neon frequently.
 */
function createPrismaClient() {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 20_000,       // recycle idle connections after 20s
    connectionTimeoutMillis: 8_000,  // fail fast if can't acquire in 8s
  });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}