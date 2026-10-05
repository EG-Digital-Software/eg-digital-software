import { useState } from 'react';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { LucideIcon } from 'lucide-react';
import { Mail, Lock, Eye, EyeOff, Users, User } from 'lucide-react';
import { toast } from 'sonner';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow/800.css';
import { brand } from '@/config/brand';
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
const TABS: {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  portal: PortalSlug;
  placeholder: string;
}[] = [
  { key: 'client', label: 'Customer', icon: User, portal: 'client', placeholder: 'you@company.com' },
  { key: 'employee', label: 'Team Member', icon: Users, portal: 'employee', placeholder: 'you@egdigital.com' },
];

const FEATURES = ['Secure', 'Scalable', 'Connected', 'Innovative'];

/** Small uppercase eyebrow/label style used across the page. */
const EYEBROW = 'text-[11px] font-bold uppercase tracking-[0.16em] text-[#a3abb9]';

const INPUT =
  'h-12 w-full rounded-none border border-[#262b36] bg-[#0b0c10] pl-[42px] text-[15px] text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-[#94a3b8]';

const ORBITS = [
  { rot: 0, dur: '14s', begin: '0s' },
  { rot: 60, dur: '18s', begin: '-4s' },
  { rot: -60, dur: '22s', begin: '-8s' },
];

/** Three tilted elliptical orbits, each with a travelling dot — the hero backdrop. */
function OrbitArt() {
  return (
    <svg viewBox="0 0 1000 700" width="100%" height="100%" aria-hidden="true" className="block overflow-visible">
      <defs>
        <radialGradient id="egCore">
          <stop offset="0" stopColor="#3a4150" stopOpacity="0.55" />
          <stop offset="1" stopColor="#3a4150" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="500" cy="350" r="160" fill="url(#egCore)">
        <animate attributeName="r" values="140;175;140" dur="6s" repeatCount="indefinite" />
      </circle>
      {ORBITS.map((o, i) => (
        <g key={i} transform={`rotate(${o.rot} 500 350)`}>
          <path
            id={`egOrb${i}`}
            d="M80,350 a420,130 0 1,0 840,0 a420,130 0 1,0 -840,0"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.16"
            strokeWidth="1.2"
          />
          <circle r="5" fill="#64748b">
            <animateMotion dur={o.dur} repeatCount="indefinite" begin={o.begin}>
              <mpath href={`#egOrb${i}`} />
            </animateMotion>
          </circle>
        </g>
      ))}
    </svg>
  );
}

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
    <div className="relative min-h-screen overflow-hidden bg-[#0b0c10] font-[Barlow,'Helvetica_Neue',system-ui,sans-serif] tracking-normal text-[#e5e7eb]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_32%_50%,#22252d_0%,#0b0c10_75%)]" />
      <div className="pointer-events-none absolute left-[32%] top-1/2 h-[640px] w-[900px] max-w-[140%] -translate-x-1/2 -translate-y-1/2">
        <OrbitArt />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col px-[clamp(16px,2.2vw,32px)] py-[22px]">
        <div className="text-lg font-semibold tracking-[0.32em] text-white">EG DIGITAL</div>

        <div className="flex flex-1 flex-wrap items-center gap-12 py-10">
          {/* ---------- Left: headline ---------- */}
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-[18px] pl-[clamp(0px,4vw,64px)]">
            <div className={EYEBROW}>Customer Portal · Secure sign-in</div>
            <h1 className="m-0 flex max-w-[720px] flex-col gap-1.5 tracking-[-0.02em] text-white">
              <span className="text-[clamp(24px,2.4vw,34px)] font-medium leading-[1.15] text-[#c7ccd6]">
                One Platform. One Login.
              </span>
              <span className="text-[clamp(64px,8.6vw,128px)] font-extrabold leading-[0.92] tracking-[-0.04em] text-transparent [-webkit-text-stroke:1.5px_#e5e7eb]">
                Unlimited
              </span>
              <span className="text-[clamp(48px,6vw,88px)] font-extrabold leading-[0.98] tracking-[-0.035em]">
                Possibilities.
              </span>
            </h1>
            <p className="m-0 max-w-[420px] text-[17px] text-[#c7ccd6]">
              Powering digital transformation across Australia and beyond.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-x-7 gap-y-2.5 text-xs font-bold uppercase tracking-[0.16em] text-[#e5e7eb]">
              {FEATURES.map((f, i) => (
                <span key={f} className="contents">
                  {i > 0 && <span className="text-[#4b5260]">·</span>}
                  <span>{f}</span>
                </span>
              ))}
            </div>
          </div>

          {/* ---------- Right: login card ---------- */}
          <div className="flex min-w-0 flex-[1_1_380px] justify-center">
            <div className="flex w-full max-w-[440px] flex-col gap-6 border border-[#1f2430] bg-[rgba(13,16,23,0.92)] px-6 pb-7 sm:px-8 pt-[34px]">
              <div className="flex flex-col gap-2">
                <div className={EYEBROW}>Sign in</div>
                <h2 className="m-0 text-[34px] !font-bold leading-[1.1] text-white">Welcome back.</h2>
                <p className="m-0 text-[15px] text-[#a3abb9]">Sign in to your {brand.companyName} account</p>
              </div>

              {/* Role tabs */}
              <div role="tablist" aria-label="Account type" className="grid grid-cols-2 border border-[#262b36]">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      'flex h-[46px] items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.14em] transition-colors',
                      tab === t.key ? 'bg-white text-[#0b0c10]' : 'bg-transparent text-[#c7ccd6] hover:text-white',
                    )}
                  >
                    <t.icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.8} />
                    {t.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="email" className={EYEBROW}>
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#8b93a3]" strokeWidth={1.8} />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder={activeTab.placeholder}
                      className={cn(INPUT, 'pr-3.5')}
                      {...register('email')}
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="password" className={EYEBROW}>
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#8b93a3]" strokeWidth={1.8} />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      className={cn(INPUT, 'pr-12')}
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-[#a3abb9] transition-colors hover:text-white"
                    >
                      {showPassword ? (
                        <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.8} />
                      ) : (
                        <Eye className="h-[18px] w-[18px]" strokeWidth={1.8} />
                      )}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm text-[#c7ccd6]">
                    <input type="checkbox" className="m-0 h-4 w-4 accent-white" {...register('rememberMe')} />
                    Remember me
                  </label>
                  <Link
                    to={authPaths.forgot(activeTab.portal ?? 'client')}
                    className="text-sm text-white underline underline-offset-[3px] hover:text-[#cbd5e1]"
                  >
                    Forgot password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-1 inline-flex min-h-[50px] items-center justify-center gap-2.5 bg-white px-7 text-[13px] font-bold uppercase tracking-[0.14em] text-[#0b0c10] transition-colors hover:bg-[#e5e7eb] disabled:opacity-60"
                >
                  {isSubmitting ? <Spinner /> : null}
                  Sign In {!isSubmitting && '→'}
                </button>
              </form>

              <div className="flex flex-wrap justify-between gap-2 border-t border-[#1f2430] pt-[18px] text-[13px] text-[#a3abb9]">
                <span>Need help?</span>
                <a href={`mailto:${brand.seller.billingEmail}`} className="font-semibold text-white hover:text-[#cbd5e1]">
                  Contact IT Support →
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Footer — the copyright doubles as the hidden admin entry. */}
        <div className="flex flex-wrap justify-between gap-3 border-t border-[#1f2430] pt-[18px] text-xs uppercase tracking-[0.12em] text-[#9ca3af]">
          <Link to="/admin/login" aria-label="EG staff login" className="transition-colors hover:text-white">
            © {year} {brand.companyName} — {brand.legal.country}
          </Link>
        </div>
      </div>
    </div>
  );
}

