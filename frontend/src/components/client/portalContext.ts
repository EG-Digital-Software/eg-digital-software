import { createContext, useContext } from 'react';

export interface ClientPortalCtx {
  /** The right-hand column; pages portal side cards into it (Overview only). */
  asideEl: HTMLElement | null;
  /** Opens the Eloma Assistant drawer, optionally asking a question straight away. */
  openAssistant: (question?: string) => void;
  /** Short status message at the bottom of the screen. */
  toast: (message: string) => void;
}

export const ClientPortalContext = createContext<ClientPortalCtx>({
  asideEl: null,
  openAssistant: () => {},
  toast: () => {},
});

export const useClientPortal = () => useContext(ClientPortalContext);

/** Melbourne is EG Eloma's home time zone (support hours, holidays). */
export const HOME_TZ = 'Australia/Melbourne';

export function clockTime(timeZone?: string, at: Date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', timeZone }).format(at);
  } catch {
    return '';
  }
}

/** Initials for avatar bubbles ("Charles Docus" → "CD"). */
export function initialsOf(name?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** Avatar bubble palette from the design. */
export const AVATAR_COLORS = ['#7FF0C2', '#B9ABFF', '#8FD8FF', '#FFCB80'];
