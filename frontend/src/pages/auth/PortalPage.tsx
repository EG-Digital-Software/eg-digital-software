import { Link, Navigate } from 'react-router-dom';
import { ShieldCheck, UserRound, Truck, Briefcase, ArrowRight, Lock, Sparkles } from 'lucide-react';
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

function PortalCard({ portal }: { portal: Portal }) {
  const Icon = portal.icon;
  return (
    <Link
      to={portal.to}
      aria-label={`Continue to ${portal.label} login`}
      className="group relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl transition-all duration-500 hover:-translate-y-2 hover:border-white/20 hover:bg-white/15 sm:p-8"
    >
      <div>
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white transition-colors duration-500 group-hover:bg-white group-hover:text-slate-900">
          <Icon className="h-6 w-6 transition-transform duration-500 group-hover:scale-110" strokeWidth={1.5} />
        </div>
        <h3 className="mt-6 text-xl font-bold tracking-tight text-white transition-colors">
          {portal.label}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-200">
          {portal.description}
        </p>
      </div>

      <div className="mt-8 flex items-center gap-2 text-sm font-semibold text-slate-300 transition-colors duration-300 group-hover:text-white">
        <span>Continue to portal</span>
        <ArrowRight className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-2" />
      </div>
    </Link>
  );
}

export default function PortalPage() {
  const user = useAuth((s) => s.user);
  const initialized = useAuth((s) => s.initialized);

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
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black font-sans selection:bg-emerald-500/30 selection:text-white">
      {/* Background Image from Internet */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img 
          src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1920" 
          alt="Modern workspace" 
          className="absolute inset-0 h-full w-full object-cover object-top opacity-80"
        />
        {/* Dark glass overlay for text readability */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      </div>

      <header className="relative z-10 flex w-full shrink-0 items-center justify-between px-6 py-4 sm:px-12 lg:px-24">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center bg-transparent">
            <img src={brand.icon} alt="" className="h-9 w-9 object-contain brightness-0 invert" />
          </div>
          <span className="text-lg font-semibold lowercase tracking-tight text-white">
            eg <span style={{ color: brand.colors.green }}>digital</span>
          </span>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 shadow-sm backdrop-blur-md sm:flex">
          <Lock className="h-3.5 w-3.5 text-emerald-400" />
          <span>Secure AES-256 Encryption</span>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-6 sm:px-12 lg:px-24">
        <div className="w-full max-w-7xl animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-300 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" />
              {brand.tagline}
            </div>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl drop-shadow-sm">
              One platform for your{' '}
              <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                entire business.
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-300 drop-shadow-sm">
              Access your personalized portal to manage billing, track products, oversee operations, and collaborate seamlessly in a secure environment.
            </p>
          </div>

          <div className="mt-10 grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PORTALS.map((p) => (
              <PortalCard key={p.to} portal={p} />
            ))}
          </div>
        </div>
      </main>

      <footer className="relative z-10 flex w-full shrink-0 flex-col items-center justify-between gap-4 border-t border-white/10 bg-black/20 px-6 py-4 backdrop-blur-lg sm:flex-row sm:px-12 lg:px-24">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          Protected area · Unauthorised access is prohibited
        </div>
        <div className="text-sm text-slate-400">
          © {new Date().getFullYear()} {brand.companyName} · {brand.legal.country}
        </div>
      </footer>
    </div>
  );
}
