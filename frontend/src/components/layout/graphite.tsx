import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { panel, eyebrow, viewAll } from '@/lib/graphite';

/* "Atomic Core · Graphite" building blocks shared by the portal dashboards. */

export function Panel({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(panel, 'min-w-0', className)}>
      <div className="flex items-center border-b border-white/[0.08] px-[22px] py-[18px]">
        <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ViewAll({ to, label = 'View all' }: { to: string; label?: string }) {
  return (
    <Link to={to} className={viewAll}>
      {label} <span aria-hidden="true">→</span>
    </Link>
  );
}

/** Three tilted orbits with travelling electrons around a pulsing core. */
export function AtomicCore({ className }: { className?: string }) {
  return (
    <svg
      viewBox="285 34 870 772"
      aria-hidden="true"
      fill="none"
      className={cn(
        'pointer-events-none absolute left-1/2 top-1/2 aspect-[870/772] -translate-x-1/2 -translate-y-1/2',
        className ?? 'h-[500px] sm:h-[660px]'
      )}
    >
      {[
        { rot: 0, dur: 13.2, delay: -5.6 },
        { rot: 60, dur: 13.4, delay: -5.4 },
        { rot: 120, dur: 15.9, delay: -0.7 },
      ].map((o) => (
        <g key={o.rot} transform={`rotate(${o.rot} 720 420)`}>
          <ellipse cx="720" cy="420" rx="420" ry="134" stroke="rgba(203,213,225,0.3)" vectorEffect="non-scaling-stroke" />
          <g
            className="eg-anim"
            style={{ transformOrigin: '720px 420px', animation: `egSpin ${o.dur}s linear ${o.delay}s infinite` }}
          >
            <circle cx="1140" cy="420" r="5" fill="rgba(100,116,139,1)" />
          </g>
        </g>
      ))}
      <circle
        cx="720"
        cy="420"
        r="40"
        fill="rgba(148,163,184,0.35)"
        className="eg-anim"
        style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'egTw 3s ease-in-out infinite' }}
      />
      <circle cx="720" cy="420" r="14" fill="#FFFFFF" fillOpacity=".85" />
    </svg>
  );
}

export interface HeroStat {
  label: string;
  /** null renders a loading placeholder. */
  value: string | null;
  sub: string;
  strong?: boolean;
}

/** Centred dashboard hero: atom backdrop, headline, stat strip and CTAs. */
export function GraphiteHero({
  kicker,
  title,
  subtitle,
  stats,
  actions,
  atomClassName,
}: {
  kicker: string;
  title: ReactNode;
  subtitle: string;
  stats: HeroStat[];
  actions?: ReactNode;
  /** Atom size override (height classes), e.g. for a shorter hero. */
  atomClassName?: string;
}) {
  return (
    <section className="relative flex flex-col items-center gap-3.5 px-0 pb-[110px] pt-[90px] text-center sm:px-8">
      <AtomicCore className={atomClassName} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[980px] -translate-x-1/2 -translate-y-1/2"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(12,13,16,0.82), rgba(12,13,16,0) 70%)' }}
      />
      <span className={cn(eyebrow, 'relative')}>{kicker}</span>
      <h1 className="relative m-0 max-w-[860px] text-[40px] font-semibold leading-[1.02] tracking-[-0.01em] text-[#F5F6F8] sm:text-[64px]">
        {title}
      </h1>
      <p className="relative m-0 text-lg text-[#C9CEDA]">{subtitle}</p>

      <div className={cn(panel, 'relative mt-[22px] flex flex-wrap justify-center')}>
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              'flex flex-col items-center gap-0.5 px-[34px] py-[18px]',
              i < stats.length - 1 && 'sm:border-r sm:border-white/[0.12]'
            )}
          >
            <span className={eyebrow}>{s.label}</span>
            {s.value === null ? (
              <Skeleton className="mt-1 h-10 w-20 bg-white/10" />
            ) : (
              <span className="text-[46px] font-semibold leading-[1.05] tabular-nums">{s.value}</span>
            )}
            <span className={cn('text-[13px]', s.strong ? 'font-semibold text-[#E2E8F0]' : 'text-[#A3AABB]')}>{s.sub}</span>
          </div>
        ))}
      </div>

      {actions && <div className="relative mt-[18px] flex flex-wrap justify-center gap-3">{actions}</div>}
    </section>
  );
}
