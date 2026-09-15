import { PrismaClient } from '@prisma/client';

/**
 * Azure Postgres drops idle connections, so the first query after a lull can hit
 * a dead pooled connection and fail with "Can't reach database server"
 * (PrismaClientInitializationError / P1001) or a reset socket — even though the
 * server is fine. That surfaced as saves silently failing. We wrap every
 * operation in a short retry so a stale connection is transparently re-tried
 * instead of bubbling a 500 to the user.
 */

const base = new PrismaClient({
  log: ['error', 'warn'],
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True for errors that mean "the connection was stale" — safe to retry. */
function isTransientConnectionError(err: unknown): boolean {
  const e = err as { name?: string; code?: string; message?: string } | null;
  if (!e) return false;
  if (e.name === 'PrismaClientInitializationError') return true;
  // P1001: can't reach server, P1002: timed out, P1017: server closed connection.
  if (e.code && ['P1001', 'P1002', 'P1017'].includes(e.code)) return true;
  const m = (e.message ?? '').toLowerCase();
  return (
    m.includes("can't reach database server") ||
    m.includes('connection reset') ||
    m.includes('econnreset') ||
    m.includes('connection closed') ||
    m.includes('server has closed the connection') ||
    m.includes('connection terminated')
  );
}

const MAX_ATTEMPTS = 4;

const extended = base.$extends({
  query: {
    async $allOperations({ args, query }) {
      let lastErr: unknown;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          return await query(args);
        } catch (err) {
          lastErr = err;
          if (attempt < MAX_ATTEMPTS && isTransientConnectionError(err)) {
            await sleep(150 * attempt); // 150ms, 300ms, 450ms
            continue;
          }
          throw err;
        }
      }
      throw lastErr;
    },
  },
});

// The retry extension changes the client's static type, which does not match the
// many helpers typed against PrismaClient / TransactionClient. The runtime API is
// identical (the extension only adds retries), so present it as a PrismaClient.
export const prisma = extended as unknown as PrismaClient;

export async function disconnectPrisma() {
  await base.$disconnect();
}
