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

// Client IDs start at EGD-5000 and increment by 1 (nextSequence returns 1 for
// the first customer, so offset by 4999).
export function formatClientId(n: number): string {
  return `EGD-${4999 + n}`;
}

export function formatInvoiceNumber(n: number, date = new Date()): string {
  const year = date.getFullYear();
  return `EGD-INV-${year}-${String(n).padStart(5, '0')}`;
}

// Every invoice carries a unique reference number of its own, generated from a
// dedicated counter so it never collides — even across years.
export function formatInvoiceReference(n: number, date = new Date()): string {
  const year = date.getFullYear();
  return `EGD-REF-${year}-${String(n).padStart(5, '0')}`;
}

export function formatLicenceKey(): string {
  const block = () =>
    Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X');
  return `EGD-${block()}-${block()}-${block()}`;
}
