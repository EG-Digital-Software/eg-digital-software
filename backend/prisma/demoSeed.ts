import 'dotenv/config';
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { AddressType, InvoiceStatus, PaymentStatus, Role, TaskPriority, TaskProgress } from '@prisma/client';
import { DEMO_DATABASE_URL, demoEnabled, disconnectPrisma, prisma, runInDemo } from '../src/config/prisma.js';
import { DEMO_ADMIN_EMAIL } from '../src/services/demo.service.js';
import {
  formatClientId,
  formatInvoiceReference,
  formatLicenceKey,
  formatSku,
  formatTaskNumber,
  generateInvoiceNumber,
  nextSequence,
} from '../src/utils/sequence.js';

/**
 * Fill the DEMO database with sample data for the admin "Demo" portal.
 *
 * SAFETY
 *  • Writes ONLY to DEMO_DATABASE_URL, through runInDemo(). The server config
 *    already refuses a DEMO_DATABASE_URL that points at the live database, and
 *    this script stops if the demo is not enabled.
 *  • Insert-only and one-shot: if the demo admin already exists it changes
 *    nothing and exits.
 *
 * Usage:  npx tsx prisma/demoSeed.ts
 */

const day = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * day);
const daysAhead = (n: number) => new Date(Date.now() + n * day);
const money = (n: number) => Math.round(n * 100) / 100;
const pick = <T>(arr: T[], i: number) => arr[i % arr.length];

const EMPLOYEES = [
  { firstName: 'Sarah', lastName: 'Mitchell', designation: 'Account Manager' },
  { firstName: 'James', lastName: 'Nguyen', designation: 'Web Developer' },
  { firstName: 'Priya', lastName: 'Sharma', designation: 'Digital Marketing Lead' },
  { firstName: 'Liam', lastName: 'Walker', designation: 'IT Support Engineer' },
];

const PRODUCTS = [
  { name: 'Microsoft 365 Business Standard', category: 'Cloud Licences', unit: 'user', price: 18.7, type: 'Licence' },
  { name: 'Website Hosting & Maintenance', category: 'Web', unit: 'site', price: 79, type: 'Service' },
  { name: 'SEO Growth Package', category: 'Marketing', unit: 'month', price: 650, type: 'Service' },
  { name: 'Social Media Management', category: 'Marketing', unit: 'month', price: 890, type: 'Service' },
  { name: 'Managed IT Support', category: 'IT Services', unit: 'hour', price: 145, type: 'Service' },
  { name: 'Google Workspace Business', category: 'Cloud Licences', unit: 'user', price: 16.8, type: 'Licence' },
  { name: 'Azure Backup', category: 'Cloud', unit: 'TB', price: 120, type: 'Service' },
];

const CUSTOMERS = [
  { company: 'Harbourview Café Pty Ltd', trading: 'Harbourview Café', type: 'HOSPITALITY_AND_TOURISM', person: 'Olivia Bennett', city: 'Sydney', state: 'NSW', postcode: '2000', street: '12 Circular Quay West' },
  { company: 'Greenfield Organics Pty Ltd', trading: 'Greenfield Organics', type: 'FARMING_AND_AGRICULTURE', person: 'Noah Thompson', city: 'Toowoomba', state: 'QLD', postcode: '4350', street: '88 Ruthven Street' },
  { company: 'Summit Build Group Pty Ltd', trading: 'Summit Build', type: 'CONSTRUCTION', person: 'Ethan Clarke', city: 'Melbourne', state: 'VIC', postcode: '3000', street: '240 Collins Street' },
  { company: 'Coastal Physio Clinic Pty Ltd', trading: 'Coastal Physio', type: 'HEALTHCARE_AND_TRANSPORT', person: 'Mia Robinson', city: 'Gold Coast', state: 'QLD', postcode: '4217', street: '5 Cavill Avenue' },
  { company: 'Brightpath Learning Pty Ltd', trading: 'Brightpath Learning', type: 'EDUCATION_AND_RESEARCH', person: 'Lucas Harris', city: 'Adelaide', state: 'SA', postcode: '5000', street: '77 King William Street' },
  { company: 'Northline Logistics Pty Ltd', trading: 'Northline Logistics', type: 'RETAIL_AND_WHOLESALE', person: 'Ava Martin', city: 'Perth', state: 'WA', postcode: '6000', street: '150 St Georges Terrace' },
  { company: 'Pixel Forge Studio Pty Ltd', trading: 'Pixel Forge', type: 'INFORMATION_TECHNOLOGY', person: 'Jack Wilson', city: 'Brisbane', state: 'QLD', postcode: '4000', street: '300 Queen Street' },
  { company: 'Silverleaf Finance Pty Ltd', trading: 'Silverleaf Finance', type: 'FINANCE_AND_MEDIA', person: 'Chloe Anderson', city: 'Canberra', state: 'ACT', postcode: '2601', street: '1 Northbourne Avenue' },
];

const TASK_TEMPLATES = [
  { title: 'Website homepage refresh', bucket: 0, progress: TaskProgress.IN_PROGRESS, priority: TaskPriority.IMPORTANT },
  { title: 'Set up Microsoft 365 mailboxes', bucket: 2, progress: TaskProgress.COMPLETED, priority: TaskPriority.MEDIUM },
  { title: 'Monthly SEO report', bucket: 1, progress: TaskProgress.ONGOING, priority: TaskPriority.MEDIUM },
  { title: 'Google Business Profile update', bucket: 0, progress: TaskProgress.NOT_STARTED, priority: TaskPriority.LOW },
  { title: 'Social media content calendar – next month', bucket: 1, progress: TaskProgress.IN_PROGRESS, priority: TaskPriority.URGENT },
  { title: 'Backup health check', bucket: 2, progress: TaskProgress.COMPLETED, priority: TaskPriority.LOW },
];

const COMMENTS = [
  'Draft is ready for review — let us know what you think.',
  'Thanks! Looks great, just a small change to the colours please.',
  'Done, updated and published.',
  'Can we schedule a quick call this week?',
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

const SEED_MARKER = 'demoSeedComplete';
const DEMO_DB_NAME = 'egdigital_demo';

async function seed() {
  const done = await prisma.setting.findUnique({ where: { key: SEED_MARKER } });
  if (done) {
    console.log('ℹ️  Demo database already has sample data — nothing changed.');
    return;
  }

  // A previous run stopped half-way: clear its partial SAMPLE rows so this run
  // starts clean. Hard check first — this only ever runs on the demo database.
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (db !== DEMO_DB_NAME) throw new Error(`Connected to "${db}", not ${DEMO_DB_NAME} — refusing to continue`);
  if (await prisma.adminUser.findUnique({ where: { email: DEMO_ADMIN_EMAIL } })) {
    const tables = await prisma.$queryRaw<{ t: string }[]>`
      SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((r) => `"public"."${r.t}"`).join(', ')} CASCADE`);
    console.log('🧹 Cleared a partial earlier demo seed (demo database only)');
  }

  // Nobody signs in with these passwords — the demo portal is opened from the
  // live admin session — so each account gets a random, unknown one.
  const randomHash = () => argon2.hash(crypto.randomBytes(24).toString('hex'));

  const admin = await prisma.adminUser.create({
    data: { firstName: 'Demo', lastName: 'Admin', email: DEMO_ADMIN_EMAIL, passwordHash: await randomHash(), lastLoginAt: new Date() },
  });

  // ── Team ────────────────────────────────────────────────
  const supportRole = await prisma.teamRole.create({
    data: { name: 'Support', tabs: ['dashboard', 'customers', 'tasks'] },
  });
  const employees = [];
  for (const e of EMPLOYEES) {
    const emp = await prisma.employeeUser.create({
      data: {
        ...e,
        email: `${slug(e.firstName)}.${slug(e.lastName)}@egeloma.demo`,
        phone: '+61 400 000 000',
        passwordHash: await randomHash(),
        approvalStatus: 'APPROVED',
        lastLoginAt: daysAgo(1),
      },
    });
    employees.push(emp);
  }
  await prisma.employeeTeamRole.createMany({
    data: employees.slice(0, 2).map((e) => ({ employeeId: e.id, roleId: supportRole.id })),
  });

  // ── Products ────────────────────────────────────────────
  const products = [];
  for (const [i, p] of PRODUCTS.entries()) {
    const sku = formatSku(await nextSequence(prisma, 'sku'));
    products.push(
      await prisma.product.create({
        data: {
          productCode: `DEMO-${String(i + 1).padStart(3, '0')}`,
          sku,
          country: 'AU',
          name: p.name,
          type: p.type,
          category: p.category,
          unit: p.unit,
          description: `${p.name} — sample product for the demo portal.`,
          pricePerQty: p.price,
          taxRate: 10,
          totalStock: 500,
          availableStock: 500 - i * 20,
          priceMode: 'MANUAL',
          billingPeriod: 'MONTHLY',
          contractTerm: 'CONTRACT_1_YEAR',
          gstType: 'EXCLUSIVE',
        },
      })
    );
  }

  // ── Customers ───────────────────────────────────────────
  for (const [ci, c] of CUSTOMERS.entries()) {
    const clientId = formatClientId(await nextSequence(prisma, 'clientId'));
    const email = `${slug(c.person)}@${slug(c.trading).replace(/\./g, '')}.demo`;
    const manager = pick(employees, ci);
    const customer = await prisma.customer.create({
      data: {
        clientId,
        companyName: c.company,
        tradingAs: c.trading,
        tradingNames: [c.trading],
        businessType: c.type,
        abn: String(51_000_000_000 + ci * 7_919_191),
        companyIdentifiers: { abn: String(51_000_000_000 + ci * 7_919_191) },
        contactPerson: c.person,
        contactEmail: email,
        contactMobile: `0412 ${String(345_000 + ci * 1111).slice(0, 3)} ${String(100 + ci * 37).padStart(3, '0')}`,
        contactPosition: 'Director',
        billingEmail: `accounts@${slug(c.trading).replace(/\./g, '')}.demo`,
        billingContactPerson: c.person,
        creditScore: 600 + ci * 45,
        reference: 'DEMO',
        accountStatus: ci === 6 ? 'ACTIVE_TRIAL' : 'ACTIVE',
        accountManagerId: manager.id,
        createdAt: daysAgo(200 - ci * 15),
        addresses: {
          create: [AddressType.PRINCIPAL, AddressType.BILLING].map((type) => ({
            type,
            line1: c.street,
            city: c.city,
            suburb: c.city,
            state: c.state,
            postcode: c.postcode,
            country: 'Australia',
          })),
        },
      },
    });

    // Portal login (sample only — never emailed).
    await prisma.clientUser.create({
      data: {
        firstName: c.person.split(' ')[0],
        lastName: c.person.split(' ').slice(1).join(' '),
        email,
        passwordHash: await randomHash(),
        approvalStatus: 'APPROVED',
        customerId: customer.id,
        lastLoginAt: daysAgo(ci + 1),
      },
    });

    // Two or three products assigned, sharing one licence key.
    const assigned = [pick(products, ci), pick(products, ci + 2), ...(ci % 2 ? [pick(products, ci + 4)] : [])];
    const licenceKey = formatLicenceKey();
    const cps = [];
    for (const [pi, p] of assigned.entries()) {
      const qty = p.unit === 'user' ? 5 + ci : 1;
      const cp = await prisma.customerProduct.create({
        data: {
          customerId: customer.id,
          productId: p.id,
          price: p.pricePerQty,
          unit: p.unit,
          unitHoursEnabled: qty > 1,
          unitHours: qty > 1 ? qty : null,
          taxRate: 10,
          issueDate: daysAgo(180 - ci * 10),
          expiryDate: ci === 3 && pi === 0 ? daysAhead(12) : daysAhead(185 + ci * 10),
          status: ci === 3 && pi === 0 ? 'EXPIRING_SOON' : 'ACTIVE',
          contractType: ci === 6 ? 'TRIAL' : 'LOCKED',
          invoicingTerm: '7 Days',
        },
      });
      await prisma.licence.create({
        data: { customerProductId: cp.id, licenceKey, issueDate: cp.issueDate, expiryDate: cp.expiryDate, status: cp.status },
      });
      cps.push({ cp, product: p, qty });
    }

    // Monthly invoices: the older ones paid, the latest open (one overdue).
    const months = 4;
    for (let m = months - 1; m >= 0; m--) {
      const invoiceDate = daysAgo(m * 30 + 3);
      const items = cps.map(({ product, qty, cp }) => {
        const unitPrice = Number(cp.price);
        const net = money(unitPrice * qty);
        const tax = money(net * 0.1);
        return { product, qty, unitPrice, net, tax };
      });
      const subtotal = money(items.reduce((s, i) => s + i.net, 0));
      const tax = money(items.reduce((s, i) => s + i.tax, 0));
      const total = money(subtotal + tax);
      const latest = m === 0;
      const status = !latest ? InvoiceStatus.PAID : ci % 3 === 0 ? InvoiceStatus.OVERDUE : InvoiceStatus.SENT;
      const dueDate = latest && status === InvoiceStatus.OVERDUE ? daysAgo(2) : new Date(invoiceDate.getTime() + 7 * day);

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: await generateInvoiceNumber(prisma),
          reference: formatInvoiceReference(await nextSequence(prisma, 'invoiceReference')),
          customerId: customer.id,
          invoiceDate,
          dueDate,
          term: 'NET_7',
          nextBillingDate: new Date(invoiceDate.getTime() + 30 * day),
          subtotal,
          tax,
          total,
          amountPaid: status === InvoiceStatus.PAID ? total : 0,
          status,
          createdAt: invoiceDate,
          items: {
            create: items.map((i) => ({
              productId: i.product.id,
              sku: i.product.sku,
              description: i.product.name,
              quantity: i.qty,
              unitPrice: i.unitPrice,
              taxRate: 10,
              taxAmount: i.tax,
              lineTotal: money(i.net + i.tax),
            })),
          },
        },
      });
      if (status === InvoiceStatus.PAID) {
        const paidAt = new Date(invoiceDate.getTime() + (2 + (ci % 4)) * day);
        await prisma.payment.create({
          data: {
            invoiceId: invoice.id,
            provider: 'mock',
            transactionId: `DEMO-TXN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
            amount: total,
            status: PaymentStatus.SUCCESS,
            paymentMethod: ci % 2 ? 'Card' : 'Bank transfer',
            paidAt,
          },
        });
      }
    }

    // ── Task board ──────────────────────────────────────────
    const buckets = [];
    for (const [order, name] of ['To do', 'In progress', 'Done'].entries()) {
      buckets.push(await prisma.taskBucket.create({ data: { customerId: customer.id, name, order } }));
    }
    const label = await prisma.taskLabel.create({ data: { customerId: customer.id, name: 'Website', color: 'emerald' } });
    const taskCount = 3 + (ci % 3);
    for (let t = 0; t < taskCount; t++) {
      const tpl = pick(TASK_TEMPLATES, ci + t);
      const assignee = pick(employees, ci + t);
      const task = await prisma.task.create({
        data: {
          taskNumber: formatTaskNumber(await nextSequence(prisma, 'taskNumber')),
          customerId: customer.id,
          bucketId: buckets[tpl.bucket].id,
          title: tpl.title,
          description: `Sample task for ${c.trading}. Everything in the demo portal is made-up data.`,
          progress: tpl.progress,
          priority: tpl.priority,
          startDate: daysAgo(10 + t),
          dueDate: daysAhead(5 + t * 3),
          order: t,
          completedAt: tpl.progress === TaskProgress.COMPLETED ? daysAgo(t + 1) : null,
          assignedTeam: pick(['Team Alpha', 'Team Beta', 'Team Gamma'], ci),
          createdById: admin.id,
          assignees: {
            create: { userId: assignee.id, userType: Role.EMPLOYEE, name: `${assignee.firstName} ${assignee.lastName}`, email: assignee.email },
          },
          labels: t === 0 ? { create: { labelId: label.id } } : undefined,
          checklist: {
            create: [
              { text: 'Gather requirements', done: true, order: 0 },
              { text: 'First draft', done: tpl.progress !== TaskProgress.NOT_STARTED, order: 1 },
              { text: 'Client sign-off', done: tpl.progress === TaskProgress.COMPLETED, order: 2 },
            ],
          },
        },
      });
      for (let k = 0; k < 2; k++) {
        const fromClient = k % 2 === 1;
        await prisma.taskComment.create({
          data: {
            taskId: task.id,
            authorId: fromClient ? customer.id : assignee.id,
            authorType: fromClient ? Role.CLIENT : Role.EMPLOYEE,
            authorName: fromClient ? c.person : `${assignee.firstName} ${assignee.lastName}`,
            body: pick(COMMENTS, ci + t + k),
            createdAt: daysAgo(3 - k),
          },
        });
      }
    }
  }

  // ── A few notifications for the demo admin ─────────────
  await prisma.notification.createMany({
    data: [
      { userId: admin.id, userType: Role.SUPER_ADMIN, type: 'PAYMENT', title: 'Payment received', body: 'Harbourview Café paid their invoice.' },
      { userId: admin.id, userType: Role.SUPER_ADMIN, type: 'TASK', title: 'New task comment', body: 'Coastal Physio replied on “Monthly SEO report”.' },
      { userId: admin.id, userType: Role.SUPER_ADMIN, type: 'LICENCE', title: 'Licence expiring soon', body: 'A Coastal Physio licence expires in 12 days.' },
    ],
  });

  await prisma.setting.create({ data: { key: SEED_MARKER, value: { at: new Date().toISOString() } } });
  console.log('✅ Demo database seeded:');
  console.log(`   ${CUSTOMERS.length} customers, ${PRODUCTS.length} products, ${EMPLOYEES.length} team members, invoices and tasks`);
}

async function main() {
  if (!demoEnabled || !DEMO_DATABASE_URL) {
    throw new Error('DEMO_DATABASE_URL is not set (or points at the live database) — refusing to seed.');
  }
  console.log(`🧪 Seeding demo database: ${new URL(DEMO_DATABASE_URL).pathname.slice(1)}`);
  await runInDemo(seed);
}

main()
  .catch((e) => {
    console.error('❌ Demo seed failed:', e);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
