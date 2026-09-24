import 'dotenv/config';
import { prisma } from '../src/config/prisma.js';
import { createCustomer } from '../src/services/customer.service.js';

/**
 * Add ONE demo customer (with a client-portal login) for testing — insert only.
 *
 * Uses the normal createCustomer service, so the client ID, addresses and the
 * encrypted portal credential are all created exactly like a real customer.
 * Idempotent: if the demo login already exists it does nothing, so re-running
 * never duplicates. It never touches or wipes any existing customer.
 *
 * Usage:  npx tsx prisma/createDemoCustomer.ts
 */
const DEMO = {
  companyName: 'Demo Test Company',
  contactPerson: 'Demo User',
  email: 'demo.client@egdigital.test',
  password: 'Demo@12345',
};

async function main() {
  const existing = await prisma.clientUser.findUnique({ where: { email: DEMO.email } });
  if (existing) {
    const cust = await prisma.customer.findUnique({
      where: { id: existing.customerId },
      select: { clientId: true, companyName: true },
    });
    console.log(
      `ℹ️  Demo customer already exists — ${cust?.companyName} (${cust?.clientId}), login ${DEMO.email}. Nothing changed.`
    );
    return;
  }

  const customer = await createCustomer({
    companyName: DEMO.companyName,
    businessType: 'Company',
    contactPerson: DEMO.contactPerson,
    contactEmail: DEMO.email,
    billingEmail: DEMO.email,
    accountStatus: 'ACTIVE',
    reference: 'DEMO',
    credential: { email: DEMO.email, password: DEMO.password },
  });

  console.log('✅ Demo customer created (existing data untouched):');
  console.log(`   Company : ${customer.companyName}`);
  console.log(`   ClientID: ${customer.clientId}`);
  console.log(`   Portal login → ${DEMO.email} / ${DEMO.password}`);
}

main()
  .catch((e) => {
    console.error('❌ Failed to create demo customer:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
