import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';

/**
 * Atomically increment a named counter and return the new value.
 * Runs inside the caller's transaction so ID generation is race-safe.
 */
export async function nextSequence(
  tx: Prisma.TransactionClient,
  key: string
): Promise<number> {
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return counter.value;
}

// Client IDs are EGD-2627-<n>, starting at EGD-2627-5000 and incrementing by 1
// (nextSequence returns 1 for the first customer, so offset by 4999). The 2627
// segment is a fixed account/branch code.
export function formatClientId(n: number): string {
  return `EGD-2627-${4999 + n}`;
}

// Task numbers are TSK-EGD-<n>, starting at TSK-EGD-5000 and incrementing by 1
// (nextSequence returns 1 for the first task, so offset by 4999).
export function formatTaskNumber(n: number): string {
  return `TSK-EGD-${4999 + n}`;
}

// Product SKUs are SKU-<n>, starting at SKU-5000 (nextSequence returns 1 for
// the first, so offset by 4999).
export function formatSku(n: number): string {
  return `SKU-${4999 + n}`;
}

// Invoice numbers are EGE-INV-2627-<XXXX>: a fixed prefix plus four random
// uppercase letters (e.g. EGE-INV-2627-QKTB). The column is unique, so the
// caller retries on the rare collision (see generateInvoiceNumber).
export function formatInvoiceNumber(): string {
  const letters = Array.from({ length: 4 }, () =>
    String.fromCharCode(65 + randomInt(26))
  ).join('');
  return `EGE-INV-2627-${letters}`;
}

// A random invoice number no other invoice holds yet. 26^4 ≈ 457k combinations,
// so a clash is rare; a few retries make it vanishingly unlikely.
export async function generateInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = formatInvoiceNumber();
    const taken = await tx.invoice.findUnique({
      where: { invoiceNumber: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new Error('Could not allocate a unique invoice number');
}

// Every invoice carries a unique reference of its own: REF-EGD-2627-5000,
// 5001, … (nextSequence returns 1 for the first, so offset by 4999). The 2627
// segment matches the client-ID account/branch code.
export function formatInvoiceReference(n: number): string {
  return `REF-EGD-2627-${4999 + n}`;
}

export function formatLicenceKey(): string {
  const block = () =>
    Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X');
  return `EGD-${block()}-${block()}-${block()}`;
}
