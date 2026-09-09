import { Link, Navigate } from 'react-router-dom';
import {
  UserCircle,
  Briefcase,
  type Icon,
} from '@phosphor-icons/react';
import { brand } from '@/config/brand';
import { Logo } from '@/components/layout/Logo';
import { useAuth } from '@/store/auth';

type Portal = {
  to: string;
  label: string;
  description: string;
  icon: Icon;
  accent: string; // chip colour classes (bg + icon + ring)
  img?: string; // optional custom image icon (used instead of the phosphor icon)
};

const PORTALS: Portal[] = [
  {
    to: '/client/login',
    label: 'Customer',
    description: 'View invoices and licences, and make secure payments.',
    icon: UserCircle,
    accent: 'bg-emerald-50 text-emerald-600 ring-emerald-500/15',
    img: '/customer-icon.png',
  },
  {
    to: '/employee/login',
    label: 'Team',
    description: 'Reach your workspace, tasks and internal tools.',
    icon: Briefcase,
    accent: 'bg-sky-50 text-sky-600 ring-sky-500/15',
    img: '/team-icon.png',
  },
];

function PortalCard({ portal }: { portal: Portal }) {
  const Icon = portal.icon;
  return (
    <Link
      to={portal.to}
      aria-label={`Continue to ${portal.label} login`}
      className="group flex flex-col items-center gap-4 text-center"
    >
      {portal.img ? (
        <img
          src={portal.img}
          alt=""
          className="h-44 w-44 object-contain transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-105 sm:h-52 sm:w-52"
        />
      ) : (
        <span className={`inline-flex rounded-full p-7 ${portal.accent} transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-105`}>
          <Icon size={48} weight="duotone" />
        </span>
      )}
      <span className="text-lg font-semibold tracking-tight text-slate-900">{portal.label} Login</span>
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
      EMPLOYEE: '/employee/tasks',
    };
    if (HOME[user.role]) return <Navigate to={HOME[user.role]} replace />;
  }

  return (
    <div className="relative grid min-h-screen w-full bg-white font-sans selection:bg-emerald-500/20 selection:text-emerald-900 lg:grid-cols-2">
      {/* Logo pinned to the top-left of the whole page */}
      <Logo light className="absolute left-3 top-3 z-20 text-2xl sm:left-4 sm:top-4 sm:text-[26px]" />

      {/* ---------- Left: content-related image, washed to white ---------- */}
      <aside className="relative hidden overflow-hidden lg:block">
        <img
          src="/portal-office.webp"
          alt="EG Digital office"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </aside>

      {/* ---------- Right: all content ---------- */}
      <div className="flex min-h-screen flex-col px-6 py-8 sm:px-12 lg:px-16">
        <main className="flex flex-1 flex-col items-center justify-center py-10 pt-20 lg:pt-10">
          <div className="w-full animate-in fade-in slide-in-from-bottom-6 duration-700">
            <h1 className="text-center text-5xl !font-extrabold uppercase leading-[1.08] tracking-normal text-[#0B223B] sm:text-6xl lg:text-7xl">
              One platform
              <br />
              for your
              <br />
              entire <span className="text-[#0052F0]">business</span>
            </h1>
            <div className="mt-12 flex flex-wrap justify-center gap-10 sm:gap-16">
              {PORTALS.map((p) => (
                <PortalCard key={p.to} portal={p} />
              ))}
            </div>
          </div>
        </main>

        <footer className="shrink-0 border-t border-slate-200 pt-5 text-center text-sm text-slate-500">
          <Link
            to="/admin/login"
            className="transition-colors hover:text-slate-700"
            aria-label="EG staff login"
          >
            © {new Date().getFullYear()} {brand.companyName} · {brand.legal.country}
          </Link>
        </footer>
      </div>
    </div>
  );
}
