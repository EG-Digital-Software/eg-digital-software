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

export function formatClientId(n: number): string {
  return `EGD-CL-${String(n).padStart(6, '0')}`;
}

export function formatInvoiceNumber(n: number, date = new Date()): string {
  const year = date.getFullYear();
  return `EGD-INV-${year}-${String(n).padStart(5, '0')}`;
}

export function formatLicenceKey(): string {
  const block = () =>
    Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X');
  return `EGD-${block()}-${block()}-${block()}`;
}
