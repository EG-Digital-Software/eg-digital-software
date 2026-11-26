import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * One-time setup of the admin "Demo" portal database. Run by hand:
 *
 *     npx tsx prisma/setupDemoDb.ts
 *
 * 1. Creates a NEW, empty database `egdigital_demo` on the same Postgres server
 *    (skipped if it already exists). The live database is never connected to
 *    for writing — the CREATE runs from the server's `postgres` maintenance DB.
 * 2. Adds DEMO_DATABASE_URL to backend/.env (if missing).
 * 3. Creates the tables in the demo database (`prisma migrate deploy`, demo URL only).
 * 4. Fills it with sample data (prisma/demoSeed.ts — insert-only, demo DB only).
 */
const DEMO_DB = 'egdigital_demo';

async function main() {
  const liveUrl = process.env.DATABASE_URL;
  if (!liveUrl) throw new Error('DATABASE_URL is not set');
  const live = new URL(liveUrl);
  const liveDb = live.pathname.replace(/^\//, '');
  if (!liveDb || liveDb === DEMO_DB) throw new Error('Unexpected DATABASE_URL — refusing to continue');

  const demo = new URL(liveUrl);
  demo.pathname = `/${DEMO_DB}`;
  const maintenance = new URL(liveUrl);
  maintenance.pathname = '/postgres';

  // 1. Create the demo database.
  const admin = new PrismaClient({ datasources: { db: { url: maintenance.toString() } } });
  try {
    const found = await admin.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM pg_database WHERE datname = ${DEMO_DB}`;
    if (found.length) console.log(`ℹ️  Database ${DEMO_DB} already exists`);
    else {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${DEMO_DB}"`);
      console.log(`✅ Created database ${DEMO_DB}`);
    }
  } finally {
    await admin.$disconnect();
  }

  // 2. DEMO_DATABASE_URL in backend/.env
  const envFile = path.resolve(process.cwd(), '.env');
  const envText = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  if (!/^DEMO_DATABASE_URL=/m.test(envText)) {
    fs.appendFileSync(envFile, `${envText.endsWith('\n') ? '' : '\n'}DEMO_DATABASE_URL="${demo.toString()}"\n`);
    console.log('✅ Added DEMO_DATABASE_URL to backend/.env');
  }

  // 3 + 4. Tables, then sample data — both pointed at the demo database only.
  const childEnv = { ...process.env, DATABASE_URL: demo.toString(), DEMO_DATABASE_URL: demo.toString() };
  const cli = path.resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
  const prismaCli = fs.existsSync(cli) ? cli : path.resolve(process.cwd(), '..', 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { env: childEnv, stdio: 'inherit' });

  // A few schema columns exist only on the live database (added there without a
  // migration file), so bring the DEMO database fully in line with the schema.
  // Additive diff, applied to the demo URL only.
  const drift = execFileSync(
    process.execPath,
    [prismaCli, 'migrate', 'diff', '--from-url', demo.toString(), '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
    { env: childEnv }
  ).toString();
  if (/^\s*(ALTER|CREATE)/m.test(drift)) {
    if (/\bDROP\s+(TABLE|COLUMN)\b/i.test(drift)) throw new Error(`Demo schema sync would drop something — stopping:\n${drift}`);
    const sqlFile = path.resolve(process.cwd(), 'demo-schema-sync.sql');
    fs.writeFileSync(sqlFile, drift);
    try {
      execFileSync(process.execPath, [prismaCli, 'db', 'execute', '--url', demo.toString(), '--file', sqlFile], { env: childEnv, stdio: 'inherit' });
    } finally {
      fs.rmSync(sqlFile, { force: true });
    }
    console.log('✅ Demo database columns synced with the schema');
  }

  // The seed checks demo ≠ live against the REAL live URL, so pass that back in.
  execFileSync('npx', ['tsx', 'prisma/demoSeed.ts'], {
    env: { ...childEnv, DATABASE_URL: liveUrl },
    stdio: 'inherit',
    shell: true,
  });
  console.log('🎉 Demo portal database ready');
}

main().catch((e) => {
  console.error('❌ Demo setup failed:', e);
  process.exit(1);
});
