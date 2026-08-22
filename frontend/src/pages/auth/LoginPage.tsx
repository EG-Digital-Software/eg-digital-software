import { useState } from 'react';
import { Link, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { toPortal, PORTAL_ROLEKEY, PORTAL_ROLE, ROLE_HOME, authPaths } from '@/lib/portal';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useLogin } from '@/hooks/useSession';
import { apiErrorMessage } from '@/api/client';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/shared/states';
import {
  AuthShell,
  AuthField,
  AuthButton,
  type AuthAccent,
  type AuthTab,
  type AuthVariant,
} from '@/components/auth/AuthShell';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

type RoleKey = 'super-admin' | 'client' | 'supplier' | 'employee';

type RoleConfig = {
  label: string;
  description: string;
  placeholder: string;
  allowSignup: boolean;
  welcome: string;
  subline: string;
  accent: AuthAccent;
  variant: AuthVariant;
};

const ROLES: Record<RoleKey, RoleConfig> = {
  'super-admin': {
    label: 'Super Admin',
    description: 'Administrative access to the EG Digital control panel.',
    placeholder: 'admin@egdigital.com.au',
    allowSignup: false,
    welcome: 'EG Digital — Business & Licence Management',
    subline: 'Manage customers, licences, invoicing and analytics in one premium workspace.',
    accent: { from: '#6366f1', to: '#8b5cf6' }, // indigo → violet
    variant: 'admin',
  },
  client: {
    label: 'Client',
    description: 'Access your invoices, licences and payments.',
    placeholder: 'you@company.com.au',
    allowSignup: true,
    welcome: 'Your invoices & licences, all in one place',
    subline: 'View statements, track licence status and pay online in seconds.',
    accent: { from: '#0d9488', to: '#10b981' }, // teal → emerald
    variant: 'client',
  },
  supplier: {
    label: 'Supplier',
    description: 'Manage supply, orders and product fulfilment.',
    placeholder: 'you@supplier.com.au',
    allowSignup: true,
    welcome: 'Manage supply, orders & fulfilment',
    subline: 'Real-time order visibility, stock control and fulfilment — without the spreadsheets.',
    accent: { from: '#ea580c', to: '#f59e0b' }, // orange → amber
    variant: 'supplier',
  },
  employee: {
    label: 'Employee',
    description: 'Access your workspace, tasks and internal tools.',
    placeholder: 'you@egdigital.com.au',
    allowSignup: true,
    welcome: 'Your workspace, tasks & tools — unified',
    subline: 'Customers, licences and internal tools in one focused place.',
    accent: { from: '#0284c7', to: '#38bdf8' }, // sky blue
    variant: 'employee',
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

  const tabs: AuthTab[] = [
    { label: 'Sign In', to: authPaths.login(portal), active: true },
    { label: 'Sign Up', to: authPaths.register(portal), disabled: !role.allowSignup },
    { label: 'Password recovery', to: authPaths.forgot(portal) },
  ];
  const forgotPath = authPaths.forgot(portal);

  const onSubmit = async (values: FormValues) => {
    try {
      const user = await login(values.email, values.password, values.rememberMe, PORTAL_ROLE[portal]);
      toast.success('Welcome back');
      const base: Record<string, string> = {
        SUPER_ADMIN: '/admin',
        CLIENT: '/client',
        SUPPLIER: '/supplier',
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
    <AuthShell
      tabs={tabs}
      welcome={role.welcome}
      subline={role.subline}
      accent={role.accent}
      variant={role.variant}
    >
      <div className="stagger">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">Sign In</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{role.description}</p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: `${role.accent.from}14`, color: role.accent.from }}
          >
            {role.label}
          </span>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="email">Login / Email</Label>
            <AuthField
              id="email"
              icon={Mail}
              type="email"
              autoComplete="email"
              placeholder={role.placeholder}
              {...register('email')}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to={forgotPath} className="text-xs font-medium text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <AuthField
              id="password"
              icon={Lock}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              {...register('rememberMe')}
            />
            Keep me signed in
          </label>

          <AuthButton type="submit" accent={role.accent} disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : null}
            Sign In
            {!isSubmitting && (
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            )}
          </AuthButton>
        </form>

        {role.allowSignup ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link to={authPaths.register(portal)} className="font-semibold text-primary hover:underline">
              Sign Up
            </Link>
          </p>
        ) : (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Protected area · Unauthorised access is prohibited.
          </p>
        )}
      </div>
    </AuthShell>
  );
}
