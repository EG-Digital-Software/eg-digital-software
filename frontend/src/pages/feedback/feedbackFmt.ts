import type React from 'react';

export const errMsg = (e: unknown, fallback = 'Something went wrong') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const initialsOf = (name: string) => {
  const w = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? '?').slice(0, 2)).toUpperCase();
};

export const sectionStyle: React.CSSProperties = { padding: 22, display: 'flex', flexDirection: 'column', gap: 14 };
export const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 };
