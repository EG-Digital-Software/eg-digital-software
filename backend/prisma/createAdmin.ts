import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

/**
 * Add (or update) a single Super Admin WITHOUT wiping anything.
 *
 * Unlike `seed.ts`, this touches only one AdminUser row: it upserts by email,
 * so re-running it just resets that admin's name/password. Safe to run against
 * the live database.
 *
 * Usage:
 *   ADMIN_EMAIL=rj@elomagroup.org ADMIN_PASSWORD='Elomagroup@2026!' \
 *   ADMIN_FIRST_NAME=RJ ADMIN_LAST_NAME=Eloma \
 *   npm run create:admin
 *
 * Defaults below match the account requested for rj@elomagroup.org.
 */
async function main() {
  const email = (process.env.ADMIN_EMAIL || 'rj@elomagroup.org').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Elomagroup@2026!';
  const firstName = process.env.ADMIN_FIRST_NAME || 'RJ';
  const lastName = process.env.ADMIN_LAST_NAME || 'Eloma';

  const passwordHash = await argon2.hash(password);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: {
      firstName,
      lastName,
      email,
      passwordHash,
      approvalStatus: 'APPROVED',
      isActive: true,
    },
    update: {
      firstName,
      lastName,
      passwordHash,
      approvalStatus: 'APPROVED',
      isActive: true,
    },
  });

  console.log(`✅ Admin ready: ${admin.email} (${admin.firstName} ${admin.lastName})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
