import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MailCheck, Mail, ArrowRight } from 'lucide-react';
import { forgotPasswordRequest, type Portal } from '@/api/auth';
import { toPortal, PORTAL_ROLEKEY } from '@/lib/portal';
import { Button } from '@/components/ui/button';
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

const schema = z.object({ email: z.string().email('Enter a valid email') });
type FormValues = z.infer<typeof schema>;

type RoleKey = 'super-admin' | 'client' | 'supplier' | 'employee';

type RecoveryConfig = {
  label: string;
  portal: Portal;
  placeholder: string;
  allowSignup: boolean;
  accent: AuthAccent;
  variant: AuthVariant;
};

const ROLES: Record<RoleKey, RecoveryConfig> = {
  'super-admin': {
    label: 'Super Admin',
    portal: 'SUPER_ADMIN',
    placeholder: 'admin@egdigital.com.au',
    allowSignup: false,
    accent: { from: '#6366f1', to: '#8b5cf6' },
    variant: 'admin',
  },
  client: {
    label: 'Client',
    portal: 'CLIENT',
    placeholder: 'you@company.com.au',
    allowSignup: true,
    accent: { from: '#0d9488', to: '#10b981' },
    variant: 'client',
  },
  supplier: {
    label: 'Supplier',
    portal: 'SUPPLIER',
    placeholder: 'you@supplier.com.au',
    allowSignup: true,
    accent: { from: '#ea580c', to: '#f59e0b' },
    variant: 'supplier',
  },
  employee: {
    label: 'Employee',
    portal: 'EMPLOYEE',
    placeholder: 'you@egdigital.com.au',
    allowSignup: true,
    accent: { from: '#0284c7', to: '#38bdf8' },
    variant: 'employee',
  },
};

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const params = useParams();

  const portal = toPortal(params.portal);
  const roleKey = PORTAL_ROLEKEY[portal] as RoleKey;
  const role = ROLES[roleKey];

  const loginPath = `/${portal}/login`;
  const tabs: AuthTab[] = [
    { label: 'Sign In', to: loginPath },
    { label: 'Sign Up', to: `/${portal}/register`, disabled: !role.allowSignup },
    { label: 'Password recovery', to: `/${portal}/forgot-password`, active: true },
  ];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    await forgotPasswordRequest(values.email, role.portal).catch(() => undefined);
    setSent(true);
  };

  return (
    <AuthShell
      tabs={tabs}
      welcome={`Recover access to your ${role.label} account`}
      subline="We'll email you a secure link to reset your password."
      accent={role.accent}
      variant={role.variant}
    >
      {sent ? (
        <div className="stagger text-center">
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg"
            style={{ background: `linear-gradient(120deg, ${role.accent.from}, ${role.accent.to})` }}
          >
            <MailCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            If a {role.label} account exists for that address, we&apos;ve sent a password reset link.
          </p>
          <Button asChild variant="outline" className="mt-6 w-full" size="lg">
            <Link to={loginPath}>Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <div className="stagger">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">Reset your password</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: `${role.accent.from}14`, color: role.accent.from }}
            >
              {role.label}
            </span>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
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
            <AuthButton type="submit" accent={role.accent} disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : null}
              Send reset link
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
      )}
    </AuthShell>
  );
}
