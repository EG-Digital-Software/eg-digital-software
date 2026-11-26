import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DEMO_DATABASE_URL, demoEnabled, prisma, runInDemo } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { signDemoToken } from '../utils/tokens.js';

/**
 * Admin "Demo" portal — a complete admin session on a SEPARATE database seeded
 * with sample data (prisma/demoSeed.ts), for showing the product to prospects.
 * Nothing in it can reach the live database: every demo request is routed to
 * the demo database by its token (middleware/demoContext.ts).
 */

/** The sample admin account the demo portal signs in as (lives only in the demo DB). */
export const DEMO_ADMIN_EMAIL = 'demo.admin@egeloma.demo';

export async function demoStatus() {
  if (!demoEnabled) return { available: false, reason: 'The demo database is not configured on this server.' };
  // The seed writes this marker last, so a half-finished seed reads as not ready.
  const seeded = await runInDemo(() => prisma.setting.findUnique({ where: { key: 'demoSeedComplete' }, select: { key: true } }));
  return seeded
    ? { available: true as const, reason: null }
    : { available: false as const, reason: 'The demo database has no sample data yet.' };
}

/** Mint a demo-portal session (a separate token, no refresh cookie). */
export async function startDemoSession() {
  if (!demoEnabled) throw new ApiError(503, 'The demo portal is not configured on this server');
  const admin = await runInDemo(() =>
    prisma.adminUser.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
    })
  );
  if (!admin) throw new ApiError(503, 'The demo portal has no sample data yet');

  const accessToken = signDemoToken({ sub: admin.id, role: 'SUPER_ADMIN', email: admin.email });
  return {
    accessToken,
    user: {
      id: admin.id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.email,
      role: 'SUPER_ADMIN' as const,
      avatarUrl: admin.avatarUrl ?? null,
    },
  };
}

/**
 * Bring the demo database's tables up to the current schema on boot, so a
 * schema change deployed for live never breaks the demo. Runs `prisma migrate
 * deploy` against DEMO_DATABASE_URL only (already checked to differ from the
 * live database). Best-effort: a failure is logged and the API keeps running.
 */
export function migrateDemoDatabase() {
  if (!DEMO_DATABASE_URL) return;
  const cli = path.resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
  if (!existsSync(cli)) {
    logger.warn('Demo database: prisma CLI not found, skipping migrations');
    return;
  }
  const child = spawn(process.execPath, [cli, 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: DEMO_DATABASE_URL },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  child.on('close', (code) => {
    if (code === 0) logger.info('🧪 Demo database migrations up to date');
    else logger.error({ code, output: output.slice(-2000) }, 'Demo database migrations failed');
  });
}
