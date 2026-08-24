/**
 * Human label for a customer now that the personal name fields are gone.
 * Falls back company → contact person → Client ID so there is always something
 * to show.
 */
export function customerDisplayName(c: {
  companyName?: string | null;
  contactPerson?: string | null;
  clientId: string;
}): string {
  return c.companyName?.trim() || c.contactPerson?.trim() || c.clientId;
}
