import { Link, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { toPortal, PORTAL_ROLEKEY, PORTAL_ROLE, ROLE_HOME, authPaths } from '@/lib/portal';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useLogin } from '@/hooks/useSession';
import { apiErrorMessage } from '@/api/client';
import { brand } from '@/config/brand';
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

type RoleKey = 'super-admin' | 'client' | 'employee';

type RoleConfig = {
  label: string;
  /** Line under the "Sign in" headline. */
  subtitle: string;
  placeholder: string;
  allowSignup: boolean;
};

const ROLES: Record<RoleKey, RoleConfig> = {
  'super-admin': {
    label: 'Admin',
    subtitle: 'Admin console · Always on. Always ready.',
    placeholder: 'admin@egdigital.com.au',
    allowSignup: false,
  },
  client: {
    label: 'Customer',
    subtitle: 'Customer portal · Always on. Always ready.',
    placeholder: 'you@company.com.au',
    allowSignup: true,
  },
  employee: {
    label: 'Team',
    subtitle: 'Team workspace · Always on. Always ready.',
    placeholder: 'you@egdigital.com.au',
    allowSignup: true,
  },
};

export default function LoginPage() {
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

  const fieldError = errors.email?.message ?? errors.password?.message;

  return (
    <SpotlightShell subtitle={role.subtitle}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3.5" noValidate>
        <SpotlightPill>
          <label htmlFor="email" className="sr-only">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={role.placeholder}
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
          <Link to={forgotPath} className={SPOTLIGHT_LINK}>
            Forgot password
          </Link>
          {role.allowSignup && (
            <Link to={authPaths.register(portal)} className={SPOTLIGHT_LINK}>
              Create account
            </Link>
          )}
          <a href={`mailto:${brand.seller.billingEmail}`} className={SPOTLIGHT_LINK}>
            Contact IT Support
          </a>
        </div>
      </form>
    </SpotlightShell>
  );
}

