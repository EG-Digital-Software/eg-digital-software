import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A duotone icon chip — a lucide icon inside a soft, colour-tinted rounded
 * square. Gives plain line icons a consistent, "relatable" coloured look across
 * the app without swapping in heavy image assets. Pass `gradient` for the
 * premium filled look used on dashboard KPIs.
 */

export type IconTone =
  | 'primary'
  | 'emerald'
  | 'sky'
  | 'violet'
  | 'amber'
  | 'rose'
  | 'slate'
  | 'indigo';

const TONE_SOFT: Record<IconTone, string> = {
  primary: 'bg-primary/10 text-primary',
  emerald: 'bg-emerald-100 text-emerald-600',
  sky: 'bg-sky-100 text-sky-600',
  violet: 'bg-violet-100 text-violet-600',
  amber: 'bg-amber-100 text-amber-600',
  rose: 'bg-rose-100 text-rose-600',
  slate: 'bg-slate-100 text-slate-600',
  indigo: 'bg-indigo-100 text-indigo-600',
};

const TONE_GRADIENT: Record<IconTone, string> = {
  primary: 'from-primary to-[#34B98C]',
  emerald: 'from-emerald-500 to-teal-500',
  sky: 'from-sky-500 to-cyan-500',
  violet: 'from-violet-500 to-purple-500',
  amber: 'from-amber-500 to-orange-500',
  rose: 'from-rose-500 to-pink-500',
  slate: 'from-slate-500 to-slate-600',
  indigo: 'from-indigo-500 to-violet-500',
};

const SIZE = {
  sm: { box: 'h-8 w-8 rounded-lg', icon: 'h-4 w-4' },
  md: { box: 'h-10 w-10 rounded-xl', icon: 'h-[18px] w-[18px]' },
  lg: { box: 'h-12 w-12 rounded-2xl', icon: 'h-6 w-6' },
} as const;

export function IconBadge({
  icon: Icon,
  tone = 'primary',
  size = 'md',
  gradient = false,
  className,
}: {
  icon: LucideIcon;
  tone?: IconTone;
  size?: keyof typeof SIZE;
  /** Filled gradient chip (white icon) instead of the soft tint. */
  gradient?: boolean;
  className?: string;
}) {
  const s = SIZE[size];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        s.box,
        gradient
          ? `bg-gradient-to-br text-white shadow-sm ${TONE_GRADIENT[tone]}`
          : TONE_SOFT[tone],
        className
      )}
    >
      <Icon className={s.icon} />
    </span>
  );
}
