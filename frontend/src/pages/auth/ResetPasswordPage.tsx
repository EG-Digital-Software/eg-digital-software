import { useState } from 'react';
import { useSearchParams, useNavigate, useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, KeyRound, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { resetPasswordRequest } from '@/api/auth';
import { apiErrorMessage } from '@/api/client';
import { toPortal, PORTAL_ROLEKEY } from '@/lib/portal';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/shared/states';
import {
  AuthShell,
  AuthField,
  AuthButton,
  type AuthAccent,
  type AuthTab,
  type AuthVariant,
  PasswordRules,
} from '@/components/auth/AuthShell';

const schema = z
  .object({
    password: z.string().min(8, 'At least 8 characters'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] });
type FormValues = z.infer<typeof schema>;

type RoleKey = 'super-admin' | 'client' | 'supplier' | 'employee';

const ROLES: Record<RoleKey, { label: string; allowSignup: boolean; accent: AuthAccent; variant: AuthVariant }> = {
  'super-admin': { label: 'Admin', allowSignup: false, accent: { from: '#6366f1', to: '#8b5cf6' }, variant: 'admin' },
  client: { label: 'Client', allowSignup: true, accent: { from: '#0d9488', to: '#10b981' }, variant: 'client' },
  supplier: { label: 'Supplier', allowSignup: true, accent: { from: '#ea580c', to: '#f59e0b' }, variant: 'supplier' },
  employee: { label: 'Employee', allowSignup: true, accent: { from: '#0284c7', to: '#38bdf8' }, variant: 'employee' },
};

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const routeParams = useParams<{ portal?: string }>();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  const portal = toPortal(routeParams.portal);
  const roleKey = PORTAL_ROLEKEY[portal] as RoleKey;
  const role = ROLES[roleKey];
  const ACCENT = role.accent;
  const loginPath = `/${portal}/login`;
  const TABS: AuthTab[] = [
    { label: 'Sign In', to: loginPath },
    { label: 'Sign Up', to: `/${portal}/register`, disabled: !role.allowSignup },
    { label: 'Password recovery', to: `/${portal}/forgot-password`, active: true },
  ];
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const newPassword = watch('password') ?? '';

  const onSubmit = async (values: FormValues) => {
    try {
      await resetPasswordRequest(token, values.password);
      toast.success('Password reset — please sign in');
      navigate(loginPath);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Reset failed'));
    }
  };

  return (
    <AuthShell
      tabs={TABS}
      welcome={`Set a fresh password for your ${role.label} account`}
      subline="Choose a strong password — you'll use it next time you sign in."
      accent={ACCENT}
      variant={role.variant}
    >
      <div className="stagger">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Set a new password</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Almost done — enter and confirm your new password.
        </p>

        {!token && (
          <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            Missing reset token. Please use the link from your email.
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <AuthField
              id="password"
              icon={Lock}
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Create a password"
              {...register('password')}
              trailing={
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            <PasswordRules value={newPassword} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <AuthField
              id="confirm"
              icon={KeyRound}
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              {...register('confirm')}
            />
            {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
          </div>

          <AuthButton type="submit" accent={ACCENT} disabled={isSubmitting || !token}>
            {isSubmitting ? <Spinner /> : null}
            Reset password
            {!isSubmitting && (
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            )}
          </AuthButton>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link to={loginPath} className="font-semibold text-primary hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
