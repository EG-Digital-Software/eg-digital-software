import { useState } from 'react';
import { Link, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { toPortal, PORTAL_ROLEKEY, PORTAL_ROLE, ROLE_HOME, authPaths } from '@/lib/portal';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useLogin } from '@/hooks/useSession';
import { apiErrorMessage } from '@/api/client';
import { Spinner } from '@/components/shared/states';
import { cn } from '@/lib/utils';
import {
  GraphiteShell,
  GRAPHITE_BUTTON,
  GRAPHITE_EYEBROW,
  GRAPHITE_INPUT,
} from '@/components/auth/GraphiteShell';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

type RoleKey = 'super-admin' | 'client' | 'employee';

type RoleConfig = {
  label: string;
  description: string;
  placeholder: string;
  allowSignup: boolean;
  /** Caption above the page headline. */
  eyebrow: string;
};

const ROLES: Record<RoleKey, RoleConfig> = {
  'super-admin': {
    label: 'Admin',
    description: 'Administrative access to the EG Digital control panel.',
    placeholder: 'admin@egdigital.com.au',
    allowSignup: false,
    eyebrow: 'Admin Console · Secure sign-in',
  },
  client: {
    label: 'Customer',
    description: 'Access your invoices, licences and payments.',
    placeholder: 'you@company.com.au',
    allowSignup: true,
    eyebrow: 'Customer Portal · Secure sign-in',
  },
  employee: {
    label: 'Team',
    description: 'Access your workspace, tasks and internal tools.',
    placeholder: 'you@egdigital.com.au',
    allowSignup: true,
    eyebrow: 'Team Workspace · Secure sign-in',
  },
};

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const sessionUser = useAuth((s) => s.user);
  const initialized = useAuth((s) => s.initialized);

  // NOTE: every hook must run before the "already signed in" early return
  // below. A successful login flips `sessionUser`, which re-renders this page;
  // if `useForm` sat after the return, React would see fewer hooks on that
  // render, throw "Rendered fewer hooks than expected", and unmount the whole
  // tree — a blank screen until the user hit refresh.
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { rememberMe: true } });

  const portal = toPortal(params.portal);
  const roleKey = PORTAL_ROLEKEY[portal] as RoleKey;
  const role = ROLES[roleKey];
  const from = (location.state as { from?: string })?.from;

  const forgotPath = authPaths.forgot(portal);

  const onSubmit = async (values: FormValues) => {
    try {
      const user = await login(values.email, values.password, values.rememberMe, PORTAL_ROLE[portal]);
      toast.success('Welcome back');
      const base: Record<string, string> = {
        SUPER_ADMIN: '/admin',
        CLIENT: '/client',
        EMPLOYEE: '/employee',
      };
      const home = ROLE_HOME[user.role] ?? '/admin/dashboard';
      const target = from?.startsWith(base[user.role]) ? from : home;
      navigate(target, { replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Login failed'));
    }
  };

  // Already signed in → don't show the login form; go to the right dashboard.
  // (Also fixes pressing Back onto a login page after logging in.)
  if (initialized && sessionUser && ROLE_HOME[sessionUser.role]) {
    return <Navigate to={ROLE_HOME[sessionUser.role]} replace />;
  }

  return (
    <GraphiteShell eyebrow={role.eyebrow}>
      <div className="flex flex-col gap-2">
        <div className={GRAPHITE_EYEBROW}>Sign in · {role.label}</div>
        <h2 className="m-0 text-[34px] !font-bold leading-[1.1] text-white">Welcome back.</h2>
        <p className="m-0 text-[15px] text-[#a3abb9]">{role.description}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className={GRAPHITE_EYEBROW}>
            Email Address
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#8b93a3]"
              strokeWidth={1.8}
            />
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={role.placeholder}
              className={cn(GRAPHITE_INPUT, 'pr-3.5')}
              {...register('email')}
            />
          </div>
          {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className={GRAPHITE_EYEBROW}>
            Password
          </label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#8b93a3]"
              strokeWidth={1.8}
            />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              className={cn(GRAPHITE_INPUT, 'pr-12')}
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
            Keep me signed in
          </label>
          <Link
            to={forgotPath}
            className="text-sm text-white underline underline-offset-[3px] hover:text-[#cbd5e1]"
          >
            Forgot password?
          </Link>
        </div>

        <button type="submit" disabled={isSubmitting} className={GRAPHITE_BUTTON}>
          {isSubmitting ? <Spinner /> : null}
          Sign In {!isSubmitting && '→'}
        </button>
      </form>

      <div className="flex flex-wrap justify-between gap-2 border-t border-[#1f2430] pt-[18px] text-[13px] text-[#a3abb9]">
        {role.allowSignup ? (
          <>
            <span>Don&apos;t have an account?</span>
            <Link to={authPaths.register(portal)} className="font-semibold text-white hover:text-[#cbd5e1]">
              Sign up →
            </Link>
          </>
        ) : (
          <span>Protected area · Unauthorised access is prohibited.</span>
        )}
      </div>
    </GraphiteShell>
  );
}

