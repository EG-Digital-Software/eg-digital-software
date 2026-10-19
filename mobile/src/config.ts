/**
 * The live EG Eloma API — the same backend (and database) the web app uses.
 * Override for local testing with EXPO_PUBLIC_API_URL, e.g.
 *   EXPO_PUBLIC_API_URL=http://192.168.1.20:4000/api npx expo start
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  'https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api';

/** How often an open task chat checks for new messages (the web uses 2s). */
export const CHAT_POLL_MS = 3000;
/** How often task lists refresh while visible. */
export const LIST_POLL_MS = 20_000;
