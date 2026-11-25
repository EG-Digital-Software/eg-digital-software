/**
 * Client-portal sections still in preview. They're open only for the demo
 * client; every other client sees them locked as "Coming soon".
 */
export const PREVIEW_CLIENT_IDS = ['EGD-2627-5002']; // Demo Test Company

export const PREVIEW_LOCKED_REASON = 'Coming soon — this section is not available on your account yet.';

export const canSeePreview = (clientId?: string | null) => !!clientId && PREVIEW_CLIENT_IDS.includes(clientId);
