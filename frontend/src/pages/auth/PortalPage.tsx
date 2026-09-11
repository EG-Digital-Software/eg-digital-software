import { useState } from 'react';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { LucideIcon } from 'lucide-react';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Users,
  User,
} from 'lucide-react';
import { ShieldCheck, Cloud, Globe, Gear, type Icon as PhosphorIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { brand } from '@/config/brand';
import { Logo } from '@/components/layout/Logo';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useLogin } from '@/hooks/useSession';
import { apiErrorMessage } from '@/api/client';
import { Spinner } from '@/components/shared/states';
import { PORTAL_ROLE, ROLE_HOME, authPaths, type PortalSlug } from '@/lib/portal';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

type TabKey = PortalSlug;

/** Visible sign-in tabs. Admin stays a hidden entry (footer copyright link).
 *  `portal` is the auth portal a tab maps to. */
const TABS: { key: TabKey; label: string; icon: LucideIcon; portal: PortalSlug }[] = [
  { key: 'client', label: 'Customer', icon: User, portal: 'client' },
  { key: 'employee', label: 'Team Member', icon: Users, portal: 'employee' },
];

/** Feature chips shown bottom-left — icons match the hero art exactly (filled). */
const FEATURES: { icon: PhosphorIcon; label: string; weight?: 'bold' | 'fill' }[] = [
  { icon: ShieldCheck, label: 'Secure' },
  { icon: Cloud, label: 'Scalable' },
  { icon: Globe, label: 'Connected' },
  { icon: Gear, label: 'Innovative' },
];

export default function PortalPage() {
  const user = useAuth((s) => s.user);
  const initialized = useAuth((s) => s.initialized);
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState<TabKey>('client');
  const [showPassword, setShowPassword] = useState(false);

  const activeTab = TABS.find((t) => t.key === tab)!;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { rememberMe: true },
  });

  const from = (location.state as { from?: string })?.from;

  const onSubmit = async (values: FormValues) => {
    try {
      const signedIn = await login(
        values.email,
        values.password,
        values.rememberMe,
        PORTAL_ROLE[activeTab.portal],
      );
      toast.success('Welcome back');
      const base: Record<string, string> = {
        SUPER_ADMIN: '/admin',
        CLIENT: '/client',
        EMPLOYEE: '/employee',
      };
      const home = ROLE_HOME[signedIn.role] ?? '/admin/dashboard';
      const target = from?.startsWith(base[signedIn.role] ?? '') ? from : home;
      navigate(target, { replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Login failed'));
    }
  };

  // Already signed in → straight to the right dashboard.
  if (initialized && user && ROLE_HOME[user.role]) {
    return <Navigate to={ROLE_HOME[user.role]} replace />;
  }

  const year = new Date().getFullYear();

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#a9c0e2] font-sans dark:bg-slate-950">
      {/* One full-bleed hero photo behind the whole page — cover fills edge-to-edge with no distortion (16:9 image ≈ minimal crop). */}
      <img src="/portal-hero.webp?v=syd9" alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_72%]" />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1fr_1fr]">
        {/* ---------- Left: brand panel (blue wash over the photo) ---------- */}
        <aside className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
          <Link to="/admin/login" aria-label="EG staff login" className="absolute left-6 top-6 z-20 w-fit">
            <Logo className="text-[28px]" />
          </Link>

          {/* top spacer keeps the heading vertically centred (logo is absolute) */}
          <div aria-hidden className="h-2" />

          <div className="relative z-10 -ml-12 -translate-y-40 max-w-xl animate-in fade-in slide-in-from-bottom-6 duration-700">
            <h1 className="!font-extrabold leading-[1.08] tracking-tight text-black text-[clamp(2.5rem,3.9vw,4.75rem)]">
              One Platform.
              <br />
              One Login.
              <br />
              <span className="whitespace-nowrap text-slate-600">Unlimited Possibilities.</span>
            </h1>
            <p className="mt-6 max-w-lg text-[clamp(1.05rem,1.15vw,1.4rem)] leading-relaxed text-slate-700">
              Powering digital transformation across Australia and beyond.
            </p>
          </div>

          {/* Feature chips + copyright — crisp text, filled icons matching the hero art. */}
          <div className="relative z-10 space-y-4">
            <div className="flex flex-wrap items-center gap-x-9 gap-y-3">
              {FEATURES.map((f) => (
                <span
                  key={f.label}
                  className="inline-flex items-center gap-3 text-[clamp(1.15rem,1.35vw,1.65rem)] font-bold text-slate-700"
                >
                  <f.icon size="1.4em" weight={f.weight ?? 'bold'} />
                  {f.label}
                </span>
              ))}
            </div>
            <Link
              to="/admin/login"
              aria-label="EG staff login"
              className="inline-block text-[clamp(0.8rem,0.8vw,1rem)] text-slate-700 transition-colors hover:text-slate-900"
            >
              © {year} {brand.companyName} — {brand.legal.country}
            </Link>
          </div>
        </aside>

        {/* ---------- Right: login card (white wash over the photo) ---------- */}
        <div className="relative flex min-h-screen items-center justify-center px-4 py-4 sm:px-6 sm:py-6 lg:justify-end lg:px-0 lg:pr-6">
          <div className="relative z-10 w-full max-w-[700px] animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex max-h-[95vh] w-full flex-col overflow-y-auto rounded-3xl border border-white/70 bg-white px-6 py-6 shadow-2xl shadow-slate-900/10 backdrop-blur-xl sm:px-10 sm:py-10 lg:min-h-[70vh] lg:px-16 lg:py-8 dark:border-slate-800 dark:bg-slate-900">
             <div className="flex w-full flex-1 flex-col justify-between gap-4 sm:gap-6">
              <div className="flex flex-col items-center text-center">
                <Logo className="text-2xl sm:text-4xl" />
                <h1 className="mt-2 !font-bold text-[1.6rem] leading-tight text-slate-900 sm:mt-4 sm:text-[2.75rem] dark:text-white">
                  Welcome Back
                </h1>
                <p className="mt-1 text-sm text-slate-500 sm:mt-2 sm:text-lg dark:text-slate-400">
                  Sign in to your {brand.companyName} account
                </p>
              </div>

              {/* Role tabs */}
              <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 dark:border-slate-700 dark:bg-white">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 py-2.5 text-sm font-medium transition sm:py-3 sm:text-base',
                      tab === t.key
                        ? 'bg-slate-400 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    <t.icon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" strokeWidth={1.75} />
                    {t.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 sm:text-[15px] dark:text-slate-300">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@egdigital.com"
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-3 text-base sm:h-16 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/5 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
                      {...register('email')}
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                </div>

                <div className="space-y-1.5 sm:space-y-2">
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700 sm:text-[15px] dark:text-slate-300">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-12 text-base sm:h-16 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/5 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 accent-slate-900 dark:border-slate-600"
                      {...register('rememberMe')}
                    />
                    Remember Me
                  </label>
                  <Link
                    to={authPaths.forgot(activeTab.portal ?? 'client')}
                    className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-white"
                  >
                    Forgot Password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="group mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-500 to-slate-700 text-base font-semibold text-white sm:h-16 shadow-lg shadow-slate-900/20 transition hover:from-slate-600 hover:to-slate-800 disabled:opacity-60 dark:from-slate-600 dark:to-slate-800"
                >
                  {isSubmitting ? <Spinner /> : null}
                  Sign In
                  {!isSubmitting && (
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                  )}
                </button>
              </form>

              <p className="text-center text-xs text-slate-500 sm:text-sm dark:text-slate-400">
                Need help?{' '}
                <a
                  href={`mailto:${brand.seller.billingEmail}`}
                  className="font-medium text-slate-900 hover:underline dark:text-white"
                >
                  Contact IT Support
                </a>
              </p>
             </div>
            </div>

            {/* Mobile-only hidden admin entry (left panel is hidden on small screens) */}
            <div className="mt-3 text-center lg:hidden">
              <Link
                to="/admin/login"
                className="text-xs text-slate-400 hover:text-slate-600"
                aria-label="EG staff login"
              >
                Staff sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
