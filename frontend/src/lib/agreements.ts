import type { CustomerDocument } from '@/types';

/** A shared agreement the client still has to fill in and sign. */
export function needsSignature(d: CustomerDocument): boolean {
  return d.status !== 'APPROVED' && d.status !== 'SUBMITTED';
}
