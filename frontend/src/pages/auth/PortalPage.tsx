import { Link, Navigate } from 'react-router-dom';
import { ShieldCheck, UserRound, Truck, Briefcase, ArrowRight } from 'lucide-react';
import { brand } from '@/config/brand';
import { useAuth } from '@/store/auth';
import { Logo } from '@/components/layout/Logo';

type Portal = {
  to: string;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
  from: string;
  to_: string;
};

const PORTALS: Portal[] = [
  {
    to: '/admin/login',
    label: 'Super Admin',
    description: 'Full administrative access — customers, billing, products and analytics.',
    icon: ShieldCheck,
    from: '#6366f1',
    to_: '#8b5cf6',
  },
  {
    to: '/client/login',
    label: 'Client',
    description: 'View your invoices, licences and make payments.',
    icon: UserRound,
    from: '#0d9488',
    to_: '#10b981',
  },
  {
    to: '/supplier/login',
    label: 'Supplier',
    description: 'Manage supply, orders and product fulfilment.',
    icon: Truck,
    from: '#ea580c',
    to_: '#f59e0b',
  },
  {
    to: '/employee/login',
    label: 'Employee',
    description: 'Access your workspace, tasks and internal tools.',
    icon: Briefcase,
    from: '#0284c7',
    to_: '#38bdf8',
  },
];

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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-12">
      {/* animated ambient glows */}
      <div className="animate-aurora pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#6366f1]/15 blur-3xl" />
      <div className="animate-float-slow pointer-events-none absolute -bottom-32 -right-24 h-[28rem] w-[28rem] rounded-full bg-[#10b981]/15 blur-3xl" />
      <div
        className="animate-aurora pointer-events-none absolute right-1/4 top-1/4 h-72 w-72 rounded-full bg-[#f59e0b]/10 blur-3xl"
        style={{ animationDelay: '5s' }}
      />

      <div className="relative z-10 w-full max-w-4xl">
        <div className="mb-10 flex flex-col items-center text-center">
          <img
            src={brand.icon}
            alt={brand.companyName}
            className="animate-float mb-4 h-14 w-auto object-contain"
          />
          <div className="mb-3">
            <Logo className="text-3xl" />
          </div>
          <h1
            className="animate-slide-up-lg text-2xl font-bold tracking-tight sm:text-3xl"
            style={{ color: brand.colors.navy }}
          >
            Welcome to {brand.companyName}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Choose your portal to continue · {brand.tagline}
          </p>
        </div>

        <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PORTALS.map((p) => (
            <Link
              key={p.to}
              to={p.to}
              className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover"
            >
              {/* hover gradient wash */}
              <span
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: `linear-gradient(120deg, ${p.from}0d, ${p.to_}14)` }}
              />
              <span
                className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-md transition-transform group-hover:scale-110"
                style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to_})` }}
              >
                <p.icon className="h-6 w-6" />
              </span>
              <div className="relative min-w-0 flex-1">
                <p className="font-semibold text-slate-800">{p.label} Login</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{p.description}</p>
              </div>
              <ArrowRight className="relative h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>

        <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Protected area · {brand.legal.country} ·
          Unauthorised access is prohibited.
        </p>
      </div>
    </div>
  );
}
