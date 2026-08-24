import { useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ShieldCheck,
  UserRound,
  Truck,
  Briefcase,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { brand } from '@/config/brand';
import { useAuth } from '@/store/auth';
import { Logo } from '@/components/layout/Logo';

type Portal = {
  to: string;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
  accent: string; // primary accent (rgb)
  glow: string; // soft glow (rgba)
};

const PORTALS: Portal[] = [
  {
    to: '/admin/login',
    label: 'Admin',
    description: 'Full control — customers, billing, products & analytics.',
    icon: ShieldCheck,
    accent: '79, 70, 229',
    glow: 'rgba(99, 102, 241, 0.18)',
  },
  {
    to: '/client/login',
    label: 'Client',
    description: 'View invoices, licences & make payments.',
    icon: UserRound,
    accent: '13, 148, 136',
    glow: 'rgba(16, 185, 129, 0.18)',
  },
  {
    to: '/supplier/login',
    label: 'Supplier',
    description: 'Manage supply, orders & fulfilment.',
    icon: Truck,
    accent: '234, 88, 12',
    glow: 'rgba(234, 88, 12, 0.16)',
  },
  {
    to: '/employee/login',
    label: 'Employee',
    description: 'Access your workspace, tasks & internal tools.',
    icon: Briefcase,
    accent: '2, 132, 199',
    glow: 'rgba(2, 132, 199, 0.16)',
  },
];

/** A portal card that tracks the cursor to drive a spotlight + border glow. */
function PortalCard({ portal }: { portal: Portal }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [pos, setPos] = useState({ x: 50, y: 50 });

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  };

  const Icon = portal.icon;

  return (
    <Link
      ref={ref}
      to={portal.to}
      onMouseMove={onMove}
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-card-hover"
      style={{ '--x': `${pos.x}%`, '--y': `${pos.y}%` } as React.CSSProperties}
    >
      {/* cursor spotlight */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(220px circle at var(--x) var(--y), ${portal.glow}, transparent 70%)`,
        }}
      />
      {/* thin top accent line */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-40 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, transparent, rgb(${portal.accent}), transparent)`,
        }}
      />

      <div className="relative flex items-start justify-between gap-4">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-black/[0.04] transition-transform duration-300 group-hover:scale-110"
          style={{
            background: `linear-gradient(135deg, rgba(${portal.accent}, 0.16), rgba(${portal.accent}, 0.04))`,
            color: `rgb(${portal.accent})`,
          }}
        >
          <Icon className="h-6 w-6" />
        </span>
        <ArrowUpRight className="h-5 w-5 text-muted-foreground/40 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-700" />
      </div>

      <div className="relative mt-5">
        <h3 className="text-lg font-semibold text-slate-800">{portal.label}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {portal.description}
        </p>
      </div>

      <div
        className="relative mt-auto flex items-center gap-1.5 pt-5 text-xs font-medium transition-colors duration-300"
        style={{ color: `rgb(${portal.accent})` }}
      >
        Continue to login
      </div>
    </Link>
  );
}

export default function PortalPage() {
  const user = useAuth((s) => s.user);
  const initialized = useAuth((s) => s.initialized);

  // Already signed in → skip the portal and go to the right home.
  if (initialized && user) {
    const HOME: Record<string, string> = {
      SUPER_ADMIN: '/admin/dashboard',
      CLIENT: '/client/dashboard',
      SUPPLIER: '/supplier/dashboard',
      EMPLOYEE: '/employee/dashboard',
    };
    if (HOME[user.role]) return <Navigate to={HOME[user.role]} replace />;
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-16">
      {/* ---- animated mesh-gradient blobs (soft on white) ---- */}
      <div className="animate-aurora pointer-events-none absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-[#6366f1]/15 blur-[120px]" />
      <div
        className="animate-aurora pointer-events-none absolute -bottom-48 -right-32 h-[34rem] w-[34rem] rounded-full bg-[#10b981]/12 blur-[120px]"
        style={{ animationDelay: '7s' }}
      />
      <div
        className="animate-float-slow pointer-events-none absolute left-1/3 top-1/4 h-72 w-72 rounded-full bg-[#38bdf8]/10 blur-[120px]"
        style={{ animationDelay: '3s' }}
      />

      {/* ---- fine grid overlay ---- */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(rgba(11,34,59,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(11,34,59,0.05) 1px, transparent 1px)',
          backgroundSize: '54px 54px',
          maskImage:
            'radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent 100%)',
        }}
      />

      <div className="relative z-10 w-full max-w-3xl">
        {/* ---- header ---- */}
        <div className="stagger mb-10 flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/70 px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-[#34b98c]" />
            {brand.tagline}
          </span>

          <div className="mt-6">
            <Logo className="text-4xl" />
          </div>

          <h1
            className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ color: brand.colors.navy }}
          >
            Welcome back
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground sm:text-base">
            Select your portal to sign in to {brand.companyName}.
          </p>
        </div>

        {/* ---- bento portal grid ---- */}
        <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PORTALS.map((p) => (
            <PortalCard key={p.to} portal={p} />
          ))}
        </div>

        {/* ---- footer ---- */}
        <p className="stagger mt-10 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Protected area · {brand.legal.country} · Unauthorised access is prohibited.
        </p>
      </div>
    </div>
  );
}
