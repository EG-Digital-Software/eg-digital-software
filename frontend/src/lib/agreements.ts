import type { AgreementField, CustomerDocument } from '@/types';

/**
 * Fields still empty on a submitted copy, for the admin to fill. Copies submitted
 * before partial filling existed carry no marks and were filled completely.
 */
export function remainingFields(d: CustomerDocument): AgreementField[] {
  const fields = d.fields ?? [];
  if (d.status !== 'SUBMITTED' || !d.signedUrl || !fields.some((f) => f.filledBy)) return [];
  return fields.filter((f) => !f.filledBy);
}

/** A shared agreement the client still has to fill in and sign. */
export function needsSignature(d: CustomerDocument): boolean {
  return d.status !== 'APPROVED' && d.status !== 'SUBMITTED';
}
