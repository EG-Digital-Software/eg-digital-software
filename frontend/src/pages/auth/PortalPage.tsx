import { useState } from 'react';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { brand } from '@/config/brand';
import { useAuth } from '@/store/auth';
import { useLogin } from '@/hooks/useSession';
import { apiErrorMessage } from '@/api/client';
import { PORTAL_ROLE, ROLE_HOME, authPaths, type PortalSlug } from '@/lib/portal';
import {
  SpotlightShell,
  SpotlightPill,
  SpotlightDivider,
  SpotlightSubmit,
  SPOTLIGHT_INPUT,
  SPOTLIGHT_LINK,
} from '@/components/auth/SpotlightShell';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

/** Visible sign-in modes. Admin stays a hidden entry (footer copyright link). */
type Mode = Extract<PortalSlug, 'client' | 'employee'>;

const MODES: Record<Mode, { placeholder: string; subtitle: string; switchLabel: string; other: Mode }> = {
  client: {
    placeholder: 'Work email',
    subtitle: 'Always on. Always ready.',
    switchLabel: 'Team sign-in',
    other: 'employee',
  },
  employee: {
    placeholder: 'Team email',
    subtitle: 'Team workspace · Always on. Always ready.',
    switchLabel: 'Customer sign-in',
    other: 'client',
  },
};

export default function PortalPage() {
  const user = useAuth((s) => s.user);
  const initialized = useAuth((s) => s.initialized);
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>('client');
  const active = MODES[mode];

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
  const switchMode = () => {
    setMode(active.other);
    reset({ email: '', password: '', rememberMe: true });
  };

  const from = (location.state as { from?: string })?.from;

  const onSubmit = async (values: FormValues) => {
    try {
      const signedIn = await login(values.email, values.password, values.rememberMe, PORTAL_ROLE[mode]);
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

  const fieldError = errors.email?.message ?? errors.password?.message;

  return (
    <SpotlightShell subtitle={active.subtitle}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3.5" noValidate>
        <SpotlightPill>
          <label htmlFor="email" className="sr-only">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={active.placeholder}
            className={SPOTLIGHT_INPUT}
            {...register('email')}
          />
          <SpotlightDivider />
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            className={SPOTLIGHT_INPUT}
            {...register('password')}
          />
          <SpotlightSubmit loading={isSubmitting} />
        </SpotlightPill>

        {fieldError && <p className="m-0 text-center text-sm text-red-400">{fieldError}</p>}

        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
          <Link to={authPaths.forgot(mode)} className={SPOTLIGHT_LINK}>
            Forgot password
          </Link>
          <button type="button" onClick={switchMode} className={`${SPOTLIGHT_LINK} border-0 bg-transparent p-0`}>
            {active.switchLabel}
          </button>
          <a href={`mailto:${brand.seller.billingEmail}`} className={SPOTLIGHT_LINK}>
            Contact IT Support
          </a>
        </div>
      </form>
    </SpotlightShell>
  );
}
