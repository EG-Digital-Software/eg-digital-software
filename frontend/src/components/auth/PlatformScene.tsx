import { useEffect, useRef, useState } from 'react';
import {
  TrendingUp,
  BadgeCheck,
  CreditCard,
  Receipt,
  Truck,
  PackageCheck,
  ListChecks,
  Ticket,
  CheckCircle2,
  BarChart3,
  Mail,
  ShieldCheck,
  KeyRound,
  MousePointerClick,
  Link2,
} from 'lucide-react';
import type { AuthAccent } from './AuthShell';

export type AuthVariant = 'admin' | 'client' | 'supplier' | 'employee' | 'recovery';

/* ================================================================== */
/* Live data helpers — real, JS-driven movement (not CSS fakes).       */
/* ================================================================== */

/**
 * Smoothly interpolating, left-scrolling series for a live line chart.
 *
 * Seeds are produced in a lazy state initialiser (not during render) and the
 * animation frame updates through the functional setter, so nothing impure runs
 * while rendering and no ref is written mid-render.
 */
function useLiveLine(points = 7) {
  const seed = () => Array.from({ length: points }, () => 30 + Math.random() * 55);
  const [vals, setVals] = useState<number[]>(seed);
  const targets = useRef<number[] | null>(null);

  useEffect(() => {
    targets.current = seed();
    let raf = 0;
    const tick = () => {
      setVals((prev) => {
        const goal = targets.current;
        if (!goal) return prev;
        const cur = prev.slice();
        let moving = false;
        for (let i = 0; i < cur.length; i++) {
          const d = goal[i] - cur[i];
          if (Math.abs(d) > 0.25) {
            cur[i] += d * 0.09;
            moving = true;
          }
        }
        // Returning `prev` unchanged lets React bail out of the re-render.
        return moving ? cur : prev;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const id = setInterval(() => {
      // shift left + append a fresh value → continuous live flow
      targets.current = [...(targets.current ?? []).slice(1), 25 + Math.random() * 60];
    }, 1500);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  return vals;
}

/** Randomised bar heights that step to new targets on an interval (CSS eases the transition). */
function useLiveBars(count = 7) {
  const [heights, setHeights] = useState<number[]>(() =>
    Array.from({ length: count }, () => 35 + Math.random() * 55)
  );
  useEffect(() => {
    const id = setInterval(() => {
      setHeights((prev) => prev.map(() => 30 + Math.random() * 65));
    }, 1400);
    return () => clearInterval(id);
  }, []);
  return heights;
}

/** A smooth 0→100 progress that loops (for a live "sending / verifying" bar). */
function useProgress(ms = 90) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setP((x) => (x >= 100 ? 0 : x + 3)), ms);
    return () => clearInterval(id);
  }, [ms]);
  return p;
}

/** A value that hops to new integers periodically. */
function useLiveValue(min: number, max: number, ms = 2000) {
  const [v, setV] = useState(() => Math.round((min + max) / 2));
  useEffect(() => {
    const id = setInterval(() => {
      setV(Math.round(min + Math.random() * (max - min)));
    }, ms);
    return () => clearInterval(id);
  }, [min, max, ms]);
  return v;
}

/* ================================================================== */
/* Chart widgets                                                       */
/* ================================================================== */

function LiveLineChart({ accent, uid }: { accent: AuthAccent; uid: string }) {
  const vals = useLiveLine(7);
  const W = 240;
  const H = 92;
  const pad = 8;
  const step = (W - pad * 2) / (vals.length - 1);
  const toXY = (v: number, i: number) => {
    const x = pad + i * step;
    const y = H - pad - (v / 100) * (H - pad * 2);
    return [x, y] as const;
  };
  const line = vals.map((v, i) => toXY(v, i).join(',')).join(' ');
  const [lx, ly] = toXY(vals[vals.length - 1], vals.length - 1);
  const area = `${pad},${H} ${line} ${W - pad},${H}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id={`ar-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent.to} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent.to} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[26, 52, 78].map((y) => (
        <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="#eef2f7" strokeWidth="1" />
      ))}
      <polygon points={area} fill={`url(#ar-${uid})`} />
      <polyline
        points={line}
        fill="none"
        stroke={accent.from}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* live cursor dot */}
      <circle cx={lx} cy={ly} r="4" fill="#fff" stroke={accent.from} strokeWidth="2.5" />
      <circle cx={lx} cy={ly} r="7" fill={accent.from} opacity="0.18" className="animate-ping" />
    </svg>
  );
}

function LiveBarChart({ accent }: { accent: AuthAccent }) {
  const heights = useLiveBars(7);
  return (
    <div className="flex h-[92px] items-end gap-2">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-md transition-[height] duration-[1200ms] ease-out"
          style={{
            height: `${h}%`,
            background: `linear-gradient(180deg, ${accent.from}, ${accent.to})`,
          }}
        />
      ))}
    </div>
  );
}

function AnimatedRing({
  accent,
  pct,
  size = 72,
}: {
  accent: AuthAccent;
  pct: number;
  size?: number;
}) {
  const r = 26;
  const dash = 2 * Math.PI * r;
  const offset = dash * (1 - pct / 100);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#eef2f7" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={accent.from}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={dash}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-sm font-bold"
        style={{ color: accent.from }}
      >
        {pct}%
      </span>
    </div>
  );
}

/* ================================================================== */
/* Shared card shell                                                   */
/* ================================================================== */

function Card({
  children,
  className,
  delay,
  float = 'animate-float-soft',
}: {
  children: React.ReactNode;
  className?: string;
  delay?: string;
  float?: string;
}) {
  return (
    <div
      className={`${float} rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_-20px_rgba(2,23,59,0.35)] ${className ?? ''}`}
      style={{ animationDelay: delay }}
    >
      {children}
    </div>
  );
}

function IconBadge({ accent, children }: { accent: AuthAccent; children: React.ReactNode }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
      style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
    >
      {children}
    </span>
  );
}

/* ================================================================== */
/* Per-role scenes (distinct layouts, no overlap)                      */
/* ================================================================== */

function AdminScene({ accent, uid }: { accent: AuthAccent; uid: string }) {
  const revenue = useLiveValue(118, 139, 1500);
  const delta = useLiveValue(4, 18, 1500);
  return (
    <>
      <Card delay="0s">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconBadge accent={accent}>
              <TrendingUp className="h-4 w-4" />
            </IconBadge>
            <div>
              <p className="text-[10px] leading-none text-slate-400">Monthly revenue</p>
              <p className="text-base font-bold leading-tight text-slate-800">
                ${revenue},400 <span className="text-[10px] font-medium text-slate-400">AUD</span>
              </p>
            </div>
          </div>
          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
            +{delta}.4%
          </span>
        </div>
        <LiveLineChart accent={accent} uid={uid} />
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card delay="0.2s">
          <p className="text-[10px] text-slate-400">Active licences</p>
          <p className="text-lg font-bold text-slate-800">1,284</p>
        </Card>
        <Card delay="0.35s">
          <p className="text-[10px] text-slate-400">Invoices paid</p>
          <p className="text-lg font-bold text-slate-800">96.2%</p>
        </Card>
      </div>

      <Card delay="0.5s" className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <BadgeCheck className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[10px] leading-none text-slate-400">New customer</p>
          <p className="text-sm font-bold text-slate-800">Approved · EGD-CL-000482</p>
        </div>
      </Card>
    </>
  );
}

function ClientScene({ accent }: { accent: AuthAccent }) {
  const paid = useLiveValue(45, 85, 1800);
  return (
    <>
      <Card delay="0s">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconBadge accent={accent}>
              <CreditCard className="h-4 w-4" />
            </IconBadge>
            <div>
              <p className="text-[10px] leading-none text-slate-400">Amount due</p>
              <p className="text-base font-bold leading-tight text-slate-800">
                $2,480 <span className="text-[10px] font-medium text-slate-400">AUD</span>
              </p>
            </div>
          </div>
          <span
            className="rounded-lg px-3 py-1 text-[11px] font-semibold text-white"
            style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
          >
            Pay now
          </span>
        </div>
        <div className="mb-1 flex justify-between text-[10px] text-slate-400">
          <span>Paid this year</span>
          <span>{paid}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-[width] duration-[1400ms] ease-out"
            style={{ width: `${paid}%`, background: `linear-gradient(90deg, ${accent.from}, ${accent.to})` }}
          />
        </div>
      </Card>

      <Card delay="0.25s">
        <p className="mb-2 text-[10px] font-semibold text-slate-400">Recent invoices</p>
        <div className="space-y-2">
          {[
            { id: 'EGD-1042', amt: '$2,480', st: 'Due', ok: false },
            { id: 'EGD-1031', amt: '$1,150', st: 'Paid', ok: true },
          ].map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-700">#{r.id}</span>
              <span className="ml-auto text-xs font-bold text-slate-800">{r.amt}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                  r.ok ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                }`}
              >
                {r.st}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card delay="0.45s" className="flex items-center gap-3">
        <IconBadge accent={accent}>
          <BadgeCheck className="h-4 w-4" />
        </IconBadge>
        <div>
          <p className="text-[10px] leading-none text-slate-400">Licence status</p>
          <p className="text-sm font-bold text-slate-800">Active · renews in 128 days</p>
        </div>
      </Card>
    </>
  );
}

function SupplierScene({ accent }: { accent: AuthAccent }) {
  const orders = useLiveValue(128, 156, 1500);
  const stock = useLiveValue(78, 96, 1600);
  return (
    <>
      <Card delay="0s">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconBadge accent={accent}>
              <BarChart3 className="h-4 w-4" />
            </IconBadge>
            <div>
              <p className="text-[10px] leading-none text-slate-400">Orders this week</p>
              <p className="text-base font-bold leading-tight text-slate-800">{orders} orders</p>
            </div>
          </div>
          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
            live
          </span>
        </div>
        <LiveBarChart accent={accent} />
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card delay="0.2s">
          <p className="text-[10px] text-slate-400">Dispatched</p>
          <p className="text-lg font-bold text-slate-800">128</p>
        </Card>
        <Card delay="0.35s" className="flex items-center gap-3">
          <AnimatedRing accent={accent} pct={stock} size={48} />
          <div>
            <p className="text-[10px] text-slate-400">Stock</p>
            <p className="text-sm font-bold text-slate-800">level</p>
          </div>
        </Card>
      </div>

      <Card delay="0.5s" className="flex items-center gap-3">
        <IconBadge accent={accent}>
          <PackageCheck className="h-4 w-4" />
        </IconBadge>
        <div className="flex-1">
          <p className="text-[10px] leading-none text-slate-400">Order #SO-3391</p>
          <p className="text-sm font-bold text-slate-800">Dispatched</p>
        </div>
        <Truck className="h-5 w-5" style={{ color: accent.from }} />
      </Card>
    </>
  );
}

function EmployeeScene({ accent }: { accent: AuthAccent }) {
  const done = useLiveValue(14, 22, 1800);
  const pct = Math.round((done / 22) * 100);
  const tasks = [
    { t: 'Approve supplier onboarding', done: true },
    { t: 'Reconcile 3 invoices', done: true },
    { t: 'Follow up licence renewal', done: false },
  ];
  return (
    <>
      <Card delay="0s" className="flex items-center gap-4">
        <AnimatedRing accent={accent} pct={pct} />
        <div>
          <p className="text-[10px] text-slate-400">Tasks completed today</p>
          <p className="text-xl font-bold text-slate-800">
            {done} <span className="text-sm font-medium text-slate-400">/ 22</span>
          </p>
          <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
            <ListChecks className="h-3 w-3" /> On track
          </div>
        </div>
      </Card>

      <Card delay="0.25s">
        <p className="mb-2 text-[10px] font-semibold text-slate-400">My checklist</p>
        <div className="space-y-2">
          {tasks.map((row) => (
            <div key={row.t} className="flex items-center gap-2">
              <span
                className="flex h-4 w-4 items-center justify-center rounded-md border"
                style={{
                  borderColor: row.done ? accent.from : '#cbd5e1',
                  background: row.done ? accent.from : 'transparent',
                }}
              >
                {row.done && <CheckCircle2 className="h-3 w-3 text-white" />}
              </span>
              <span
                className={`text-xs ${row.done ? 'text-slate-400 line-through' : 'font-medium text-slate-700'}`}
              >
                {row.t}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card delay="0.45s" className="flex items-center gap-3">
        <IconBadge accent={accent}>
          <Ticket className="h-4 w-4" />
        </IconBadge>
        <div>
          <p className="text-[10px] leading-none text-slate-400">Ticket #T-208</p>
          <p className="text-sm font-bold text-slate-800">Resolved</p>
        </div>
      </Card>
    </>
  );
}

const RESET_STEPS = [
  { icon: Mail, label: 'Reset link emailed' },
  { icon: MousePointerClick, label: 'Open the secure link' },
  { icon: KeyRound, label: 'Set a new password' },
  { icon: CheckCircle2, label: 'Password updated' },
];

function RecoveryScene({ accent }: { accent: AuthAccent }) {
  const prog = useProgress(70);
  // Walk through the reset flow: email → click link → new password → done.
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % RESET_STEPS.length), 1300);
    return () => clearInterval(id);
  }, []);
  // Password dots "typing" while the set-password step is active.
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d >= 8 ? 0 : d + 1)), 260);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {/* reset link sent */}
      <Card delay="0s">
        <div className="mb-3 flex items-center gap-2">
          <IconBadge accent={accent}>
            <Mail className="h-4 w-4" />
          </IconBadge>
          <div>
            <p className="text-[10px] leading-none text-slate-400">Secure reset link sent</p>
            <p className="text-sm font-bold leading-tight text-slate-800">j•••••n@gmail.com</p>
          </div>
          <span className="ml-auto rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
            sending
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full"
            style={{ width: `${prog}%`, background: `linear-gradient(90deg, ${accent.from}, ${accent.to})` }}
          />
        </div>
      </Card>

      {/* animated reset flow (email → link → new password → done) */}
      <Card delay="0.25s">
        <p className="mb-3 flex items-center gap-1 text-[10px] font-semibold text-slate-400">
          <Link2 className="h-3 w-3" /> How reset works
        </p>
        <div className="space-y-2.5">
          {RESET_STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            const done = i < step;
            const on = active || done;
            return (
              <div key={s.label} className="flex items-center gap-2.5">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-300"
                  style={{
                    borderColor: on ? accent.from : '#e2e8f0',
                    background: done ? accent.from : on ? `${accent.from}14` : '#f8fafc',
                    color: done ? '#fff' : on ? accent.from : '#cbd5e1',
                    transform: active ? 'scale(1.12)' : 'scale(1)',
                    boxShadow: active ? `0 0 0 4px ${accent.from}1f` : 'none',
                  }}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                </span>
                <span
                  className={`text-xs transition-colors ${on ? 'font-semibold text-slate-800' : 'text-slate-400'}`}
                >
                  {s.label}
                </span>

                {/* password field shows only on the set-password step */}
                {active && i === 2 && (
                  <span className="ml-auto flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                    {Array.from({ length: 8 }).map((_, d) => (
                      <span
                        key={d}
                        className="h-1.5 w-1.5 rounded-full transition-colors duration-150"
                        style={{ background: d < dots ? accent.from : '#cbd5e1' }}
                      />
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* identity verified */}
      <Card delay="0.45s" className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="text-[10px] leading-none text-slate-400">Identity verified</p>
          <p className="text-sm font-bold text-slate-800">2FA · Encrypted reset</p>
        </div>
        <CheckCircle2 className="h-5 w-5" style={{ color: accent.from }} />
      </Card>
    </>
  );
}

/* ================================================================== */
/* Public component                                                    */
/* ================================================================== */

export function PlatformScene({
  accent,
  variant = 'admin',
}: {
  accent: AuthAccent;
  variant?: AuthVariant;
}) {
  const uid = accent.from.replace('#', '') + variant;
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      {variant === 'admin' && <AdminScene accent={accent} uid={uid} />}
      {variant === 'client' && <ClientScene accent={accent} />}
      {variant === 'supplier' && <SupplierScene accent={accent} />}
      {variant === 'employee' && <EmployeeScene accent={accent} />}
      {variant === 'recovery' && <RecoveryScene accent={accent} />}
    </div>
  );
}
