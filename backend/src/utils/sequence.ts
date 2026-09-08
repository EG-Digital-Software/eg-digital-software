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

export function formatInvoiceNumber(n: number, date = new Date()): string {
  const year = date.getFullYear();
  return `EGD-INV-${year}-${String(n).padStart(5, '0')}`;
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
