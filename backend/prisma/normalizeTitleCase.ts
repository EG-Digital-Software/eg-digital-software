/**
 * One-time data normalisation: Title-Case the human-name / free-text columns so
 * existing records match the new form behaviour (every word's first letter
 * capitalised, the rest lower — independent of how the data was originally
 * typed).
 *
 * Deliberately EXCLUDED — these would be corrupted by title-casing:
 *   • emails, passwords            (contactEmail, billingEmail, …)
 *   • codes / keys / identifiers   (productCode, sku, abn, acn, clientId, …)
 *   • numbers                      (postcode, mobiles, prices, credit score)
 *   • URLs / websites              (organisation.website)
 *   • descriptions / notes         (product.description, invoice notes)
 *   • enums / preset labels        (state "VIC", businessType, paymentMethod)
 *
 * Safe by default: runs as a DRY RUN and only prints what would change. Pass
 * `apply` to actually write:
 *     tsx prisma/normalizeTitleCase.ts          # preview only
 *     tsx prisma/normalizeTitleCase.ts apply     # write changes
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('apply');

/** Mirror of the frontend `toTitleCase` (src/lib/input.ts) so typed and stored
 *  values normalise identically. Word breaks: space and the separators names /
 *  addresses use ( / - . ' ). Digits and symbols pass through. */
const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function toTitleCase(v: string): string {
  return v.toLowerCase().replace(/\p{L}+(?:'\p{L}+)?/gu, (word) => {
    const apos = word.indexOf("'");
    if (apos === -1) return cap(word);
    const before = word.slice(0, apos);
    const after = word.slice(apos + 1);
    // O'Brien / D'Souza capitalise both sides; Ruby's / John's keep the suffix.
    return before.length === 1 ? `${cap(before)}'${cap(after)}` : `${cap(before)}'${after}`;
  });
}

let totalChanges = 0;

/** Title-case one text column across a model, updating only rows that differ. */
async function normaliseColumn(
  model: string,
  field: string,
  rows: Array<Record<string, unknown>>,
  update: (id: string, value: string) => Promise<unknown>
) {
  let changed = 0;
  for (const row of rows) {
    const id = row.id as string;
    const current = row[field];
    if (typeof current !== 'string' || current.trim() === '') continue;
    const next = toTitleCase(current);
    if (next === current) continue;
    changed++;
    console.log(`  ${model}.${field}  "${current}"  ->  "${next}"`);
    if (APPLY) await update(id, next);
  }
  if (changed) console.log(`→ ${model}.${field}: ${changed} row(s)`);
  totalChanges += changed;
}

async function main() {
  console.log(APPLY ? '=== APPLYING Title Case ===' : '=== DRY RUN (no writes) — pass "apply" to commit ===');

  // ── Account tables: firstName, lastName ────────────────────
  for (const model of ['adminUser', 'clientUser', 'supplierUser', 'employeeUser'] as const) {
    const rows = await (prisma[model] as any).findMany({ select: { id: true, firstName: true, lastName: true } });
    for (const field of ['firstName', 'lastName']) {
      await normaliseColumn(model, field, rows, (id, value) =>
        (prisma[model] as any).update({ where: { id }, data: { [field]: value } })
      );
    }
  }

  // ── Customer: names / trading / contact roles ──────────────
  const customerFields = [
    'companyName',
    'tradingAs',
    'contactPerson',
    'contactPosition',
    'authorizedPerson',
    'invoiceCustomer',
    'billingContactPerson',
  ] as const;
  const customers = await prisma.customer.findMany({
    select: { id: true, tradingNames: true, ...Object.fromEntries(customerFields.map((f) => [f, true])) } as any,
  });
  for (const field of customerFields) {
    await normaliseColumn('customer', field, customers as any, (id, value) =>
      prisma.customer.update({ where: { id }, data: { [field]: value } })
    );
  }
  // tradingNames is a String[] — title-case each entry.
  {
    let changed = 0;
    for (const c of customers as any[]) {
      const arr: string[] = Array.isArray(c.tradingNames) ? c.tradingNames : [];
      const next = arr.map((n) => (typeof n === 'string' && n.trim() ? toTitleCase(n) : n));
      if (JSON.stringify(next) !== JSON.stringify(arr)) {
        changed++;
        console.log(`  customer.tradingNames  [${arr.join(', ')}]  ->  [${next.join(', ')}]`);
        if (APPLY) await prisma.customer.update({ where: { id: c.id }, data: { tradingNames: next } });
      }
    }
    if (changed) console.log(`→ customer.tradingNames: ${changed} row(s)`);
    totalChanges += changed;
  }

  // ── Director: legal name parts ─────────────────────────────
  const directors = await prisma.director.findMany({ select: { id: true, firstName: true, middleName: true, lastName: true } });
  for (const field of ['firstName', 'middleName', 'lastName']) {
    await normaliseColumn('director', field, directors, (id, value) =>
      prisma.director.update({ where: { id }, data: { [field]: value } })
    );
  }

  // ── Address: street / locality (NOT state / postcode / country) ─
  const addresses = await prisma.address.findMany({ select: { id: true, line1: true, line2: true, city: true, suburb: true } });
  for (const field of ['line1', 'line2', 'city', 'suburb']) {
    await normaliseColumn('address', field, addresses, (id, value) =>
      prisma.address.update({ where: { id }, data: { [field]: value } })
    );
  }

  // ── Product: name / type / category (NOT code / sku / description / unit) ─
  const products = await prisma.product.findMany({ select: { id: true, name: true, type: true, category: true } });
  for (const field of ['name', 'type', 'category']) {
    await normaliseColumn('product', field, products, (id, value) =>
      prisma.product.update({ where: { id }, data: { [field]: value } })
    );
  }

  // ── Organisation settings (JSON) ───────────────────────────
  {
    const row = await prisma.setting.findUnique({ where: { key: 'organisation' } });
    if (row && row.value && typeof row.value === 'object') {
      const org = { ...(row.value as Record<string, unknown>) };
      let changed = 0;
      for (const field of ['companyName', 'legalName', 'addressLine1', 'addressLine2', 'city']) {
        const cur = org[field];
        if (typeof cur === 'string' && cur.trim()) {
          const next = toTitleCase(cur);
          if (next !== cur) {
            changed++;
            console.log(`  setting.organisation.${field}  "${cur}"  ->  "${next}"`);
            org[field] = next;
          }
        }
      }
      if (changed) {
        console.log(`→ setting.organisation: ${changed} field(s)`);
        totalChanges += changed;
        if (APPLY) await prisma.setting.update({ where: { key: 'organisation' }, data: { value: org as any } });
      }
    }
  }

  console.log(`\n${APPLY ? 'Applied' : 'Would change'} ${totalChanges} value(s).`);
  if (!APPLY && totalChanges) console.log('Re-run with:  npm run normalize:names -- apply');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
