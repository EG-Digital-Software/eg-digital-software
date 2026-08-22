import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

/**
 * Clean seed — provisions an EMPTY EG Digital instance.
 *
 * Creates the Super Admin only. No demo customers, products, invoices,
 * licences, payments or portal logins: the platform starts empty so every
 * record in the panel is real data entered by the operator.
 */
async function main() {
  console.log('🌱 Seeding EG Digital (clean install)…');

  // ── Wipe all business + portal data (child rows first) ─
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.licence.deleteMany();
  await prisma.customerProduct.deleteMany();
  await prisma.address.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.clientUser.deleteMany();
  await prisma.supplierUser.deleteMany();
  await prisma.employeeUser.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.setting.deleteMany();
  console.log('   ✓ Database cleared');

  // ── Super Admin (credentials from env) ─────────────────
  const email = (process.env.SUPER_ADMIN_EMAIL || 'admin@egdigital.com.au').toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe!2026';
  await prisma.adminUser.create({
    data: {
      firstName: process.env.SUPER_ADMIN_FIRST_NAME || 'EG',
      lastName: process.env.SUPER_ADMIN_LAST_NAME || 'Admin',
      email,
      passwordHash: await argon2.hash(password),
    },
  });
  console.log(`   ✓ Super Admin: ${email}`);

  console.log('✅ Seed complete — panel is empty and ready for real data.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
