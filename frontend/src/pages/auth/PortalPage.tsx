import { useState } from 'react';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { LucideIcon } from 'lucide-react';
import { Mail, Lock, Eye, EyeOff, Users, User } from 'lucide-react';
import { toast } from 'sonner';
import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useLogin } from '@/hooks/useSession';
import { apiErrorMessage } from '@/api/client';
import { Spinner } from '@/components/shared/states';
import { PORTAL_ROLE, ROLE_HOME, authPaths, type PortalSlug } from '@/lib/portal';
import {
  GraphiteShell,
  GRAPHITE_BUTTON,
  GRAPHITE_EYEBROW as EYEBROW,
  GRAPHITE_INPUT as INPUT,
} from '@/components/auth/GraphiteShell';

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
  { key: 'employee', label: 'Team', icon: Users, portal: 'employee', placeholder: 'you@egdigital.com' },
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
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { rememberMe: true },
  });

  /** Switching account type starts a fresh form — no credentials carry over. */
  const switchTab = (next: TabKey) => {
    if (next === tab) return;
    setTab(next);
    setShowPassword(false);
    reset({ email: '', password: '', rememberMe: true });
  };

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

  return (
    <GraphiteShell>
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
            onClick={() => switchTab(t.key)}
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
          className={GRAPHITE_BUTTON}
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
    </GraphiteShell>
  );
}
