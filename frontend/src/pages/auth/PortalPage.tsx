import { Link, Navigate } from 'react-router-dom';
import { ShieldCheck, UserRound, Truck, Briefcase, ArrowRight, Lock } from 'lucide-react';
import { brand } from '@/config/brand';
import { useAuth } from '@/store/auth';

type Portal = {
  to: string;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
};

const PORTALS: Portal[] = [
  {
    to: '/admin/login',
    label: 'Admin',
    description: 'Full control over customers, billing, products and analytics.',
    icon: ShieldCheck,
  },
  {
    to: '/client/login',
    label: 'Client',
    description: 'View invoices and licences, and make secure payments.',
    icon: UserRound,
  },
  {
    to: '/supplier/login',
    label: 'Supplier',
    description: 'Manage supply, orders and fulfilment in one place.',
    icon: Truck,
  },
  {
    to: '/employee/login',
    label: 'Employee',
    description: 'Reach your workspace, tasks and internal tools.',
    icon: Briefcase,
  },
];

/** A large, full-height portal card — icon, copy, and a sliding call-to-action. */
function PortalCard({ portal }: { portal: Portal }) {
  const Icon = portal.icon;
  return (
    <Link
      to={portal.to}
      aria-label={`Continue to ${portal.label} login`}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-slate-300 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B223B] focus-visible:ring-offset-2 sm:p-8"
    >
      {/* thin brand accent that reveals on hover */}
      <span className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-[#34B98C] transition-transform duration-300 group-hover:scale-x-100" />

      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition-all duration-300 group-hover:scale-105 group-hover:bg-[#0B223B] group-hover:text-white">
        <Icon className="h-7 w-7" />
      </span>

      <h3 className="mt-6 text-xl font-semibold text-slate-900">{portal.label}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{portal.description}</p>

      <span className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B223B]">
        Continue to login
        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
      </span>
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
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-white">
      {/* ── Light hero background image (self-hosted), full-bleed ── */}
      <img
        src="/portal-bg.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Light white wash — enough to keep text legible while the image shows through. */}
      <div className="absolute inset-0 bg-white/55 backdrop-blur-[1px]" />

      {/* ── Top bar (full width) ── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10 lg:px-16">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center bg-transparent">
            <img src={brand.icon} alt="" className="h-9 w-9 object-contain" />
          </span>
          <span className="text-lg font-semibold lowercase tracking-tight text-[#0B223B]">
            eg <span style={{ color: brand.colors.green }}>digital</span>
          </span>
        </div>
        <span className="hidden items-center gap-2 text-xs font-medium text-slate-500 sm:flex">
          <Lock className="h-3.5 w-3.5" />
          Secure sign-in · {brand.legal.country}
        </span>
      </header>

      {/* ── Hero + portal grid (full width) ── */}
      <main className="relative z-10 flex flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="stagger w-full">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">
              {brand.tagline}
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-[#0B223B] sm:text-5xl lg:text-6xl">
              One platform for your entire business.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600">
              Choose your portal to sign in to {brand.companyName} — customers, billing, licences
              and fulfilment, each team in its own secure workspace.
            </p>
          </div>

          {/* full-width four-across grid */}
          <div className="mt-12 grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {PORTALS.map((p) => (
              <PortalCard key={p.to} portal={p} />
            ))}
          </div>
        </div>
      </main>

      {/* ── Footer (full width) ── */}
      <footer className="relative z-10 flex flex-col items-center justify-between gap-2 px-6 py-6 text-center sm:flex-row sm:px-10 sm:text-left lg:px-16">
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Lock className="h-3.5 w-3.5" />
          Protected area · Unauthorised access is prohibited.
        </p>
        <p className="text-xs text-slate-400">
          © {new Date().getFullYear()} {brand.companyName} · {brand.legal.country}
        </p>
      </footer>
    </div>
  );
}
