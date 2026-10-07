import { cn } from '@/lib/utils';

/* "Atomic Core · Graphite" class tokens shared by the portal dashboards. */

export const panel = 'border border-white/10 bg-[rgba(10,13,22,0.62)] backdrop-blur-[14px]';
export const eyebrow = 'text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A3AABB]';
const btnBase =
  'inline-flex h-[46px] items-center justify-center px-7 text-[13px] font-bold uppercase tracking-[0.1em] transition-colors';
export const btnLight = cn(btnBase, 'bg-white text-[#070A12] hover:bg-[#E2E8F0] hover:text-[#070A12]');
export const btnDark = cn(btnBase, 'bg-[rgba(40,46,62,0.7)] text-white hover:bg-[rgba(58,66,88,0.8)] hover:text-white');
export const viewAll = 'ml-auto text-xs font-bold uppercase tracking-[0.1em] text-white hover:text-[#D5D9E2]';
