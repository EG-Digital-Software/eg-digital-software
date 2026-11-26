import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Azure Postgres drops idle connections, so the first query after a lull can hit
 * a dead pooled connection and fail with "Can't reach database server"
 * (PrismaClientInitializationError / P1001) or a reset socket — even though the
 * server is fine. That surfaced as saves silently failing. We wrap every
 * operation in a short retry so a stale connection is transparently re-tried
 * instead of bubbling a 500 to the user.
 */

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

function createClient(url?: string) {
  const base = new PrismaClient({
    log: ['error', 'warn'],
    ...(url ? { datasources: { db: { url } } } : {}),
  });
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
  return { base, client: extended as unknown as PrismaClient };
}

const live = createClient();

// ─── Demo database ─────────────────────────────────────────
// The admin "Demo" portal runs every request against a SEPARATE database full of
// sample data, so prospects can click through the real product without ever
// seeing or touching live data. A request is routed to the demo database only
// when its access token carries `demo: true` (see middleware/demoContext.ts).

/** "host:port/dbname" of a postgres URL — what decides "is this the same database?". */
export function databaseIdentity(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase()}:${u.port || '5432'}/${decodeURIComponent(u.pathname.replace(/^\//, '')).toLowerCase()}`;
  } catch {
    return null;
  }
}

function resolveDemoUrl(): string | null {
  const demoUrl = env.DEMO_DATABASE_URL?.trim();
  if (!demoUrl) return null;
  const demoId = databaseIdentity(demoUrl);
  const liveId = databaseIdentity(env.DATABASE_URL);
  // Hard safety stop: the demo must never point at the live database.
  if (!demoId || !liveId || demoId === liveId) {
    logger.error('🛑 DEMO_DATABASE_URL is missing a database name or points at the live database — demo portal DISABLED');
    return null;
  }
  return demoUrl;
}

export const DEMO_DATABASE_URL = resolveDemoUrl();
const demo = DEMO_DATABASE_URL ? createClient(DEMO_DATABASE_URL) : null;

/** Whether the demo portal is available on this server. */
export const demoEnabled = !!demo;

interface DbContext {
  demo: boolean;
  client: PrismaClient;
}
const dbContext = new AsyncLocalStorage<DbContext>();

/** True while handling a demo-portal request (or work it started). */
export function isDemoContext(): boolean {
  return dbContext.getStore()?.demo === true;
}

/** Run `fn` (and everything it awaits or schedules) against the demo database. */
export function runInDemo<T>(fn: () => T): T {
  if (!demo) throw new Error('Demo database is not configured');
  return dbContext.run({ demo: true, client: demo.client }, fn);
}

const current = (): PrismaClient => dbContext.getStore()?.client ?? live.client;

/**
 * The client every service imports. It forwards to the live database, or to the
 * demo database while inside runInDemo — so no service needs to know which one
 * it is talking to.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = current();
    const value = Reflect.get(client as object, prop);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export async function disconnectPrisma() {
  await Promise.all([live.base.$disconnect(), demo?.base.$disconnect()]);
}
