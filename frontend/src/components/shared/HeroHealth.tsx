import { ShieldCheck, Box } from 'lucide-react';
import heroWave from '@/assets/hero-wave.png';

/** Blue wave graphic that fills the right of a hero banner and fades to the left. */
export function HeroWave() {
  return (
    <img
      src={heroWave}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none scale-110 object-cover object-right opacity-90 [mask-image:linear-gradient(to_right,transparent,black_40%)]"
    />
  );
}

/** Map a 0–100 health score to a short qualitative label. */
export function healthLabel(pct: number): string {
  if (pct >= 90) return 'Excellent';
  if (pct >= 75) return 'Good';
  if (pct >= 50) return 'Fair';
  return 'At risk';
}

/** Green progress donut used inside the hero health card. */
function HealthDonut({ pct, label }: { pct: number; label: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const len = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div className="relative h-[104px] w-[104px]">
      <svg viewBox="0 0 100 100" className="h-[104px] w-[104px] -rotate-90">
        <defs>
          <linearGradient id="hero-health" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e6f5ee" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="url(#hero-health)"
          strokeWidth="9"
          strokeDasharray={`${len} ${c - len}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-bold leading-none tracking-tight text-slate-800">{pct}%</span>
        <span className="mt-1 text-[11px] font-medium text-emerald-600">{label}</span>
      </div>
    </div>
  );
}

/** Tiny green area chart for the floating card behind the health donut. */
function MiniAreaChart({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 56" preserveAspectRatio="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="hero-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 40 L18 30 L34 36 L52 18 L70 26 L86 10 L100 16 V56 H0 Z" fill="url(#hero-spark)" />
      <path
        d="M0 40 L18 30 L34 36 L52 18 L70 26 L86 10 L100 16"
        fill="none"
        stroke="#10b981"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Floating health cluster (shield · donut · chart · cube) shown on the right of a hero banner. */
export function HeroHealthCluster({
  title = 'Account Health',
  pct,
  label,
}: {
  title?: string;
  pct: number;
  label: string;
}) {
  return (
    <div className="relative h-[210px] w-full max-w-[440px] shrink-0 md:w-[46%]">
      {/* Chart card — sits behind, offset to the right */}
      <div className="absolute right-1 top-9 h-[128px] w-[132px] rounded-2xl border border-white/70 bg-white/85 p-3 shadow-lg backdrop-blur">
        <MiniAreaChart className="h-full w-full" />
      </div>

      {/* Cube badge — top right */}
      <div className="absolute right-3 top-0 flex h-11 w-11 items-center justify-center rounded-xl border border-blue-100 bg-white text-blue-500 shadow-md">
        <Box className="h-5 w-5" />
      </div>

      {/* Shield badge — mid left */}
      <div className="absolute left-1 top-20 flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-100 bg-white text-emerald-500 shadow-md">
        <ShieldCheck className="h-5 w-5" />
      </div>

      {/* Main health card */}
      <div className="absolute left-1/2 top-8 w-[182px] -translate-x-1/2 rounded-2xl border border-white/70 bg-white p-4 shadow-xl">
        <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
        <div className="mt-2 flex justify-center">
          <HealthDonut pct={pct} label={label} />
        </div>
      </div>
    </div>
  );
}
