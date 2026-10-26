import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { forgotPasswordRequest, type Portal } from '@/api/auth';
import { brand } from '@/config/brand';
import { toPortal, PORTAL_ROLEKEY } from '@/lib/portal';
import {
  SpotlightShell,
  SpotlightPill,
  SpotlightSubmit,
  SPOTLIGHT_INPUT,
  SPOTLIGHT_LINK,
} from '@/components/auth/SpotlightShell';

const schema = z.object({ email: z.string().email('Enter a valid email') });
type FormValues = z.infer<typeof schema>;

type RoleKey = 'super-admin' | 'client' | 'employee';

type RecoveryConfig = {
  label: string;
  portal: Portal;
  placeholder: string;
  /** Where "Back to sign in" goes. */
  signInPath: string;
};

const ROLES: Record<RoleKey, RecoveryConfig> = {
  'super-admin': {
    label: 'Admin',
    portal: 'SUPER_ADMIN',
    placeholder: 'admin@egdigital.com.au',
    signInPath: '/admin/login',
  },
  client: {
    label: 'Customer',
    portal: 'CLIENT',
    placeholder: 'you@company.com.au',
    signInPath: '/',
  },
  employee: {
    label: 'Team',
    portal: 'EMPLOYEE',
    placeholder: 'you@egdigital.com.au',
    signInPath: '/',
  },
};

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const params = useParams();

  const portal = toPortal(params.portal);
  const roleKey = PORTAL_ROLEKEY[portal] as RoleKey;
  const role = ROLES[roleKey];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    await forgotPasswordRequest(values.email, role.portal).catch(() => undefined);
    setSent(true);
  };

  if (sent) {
    return (
      <SpotlightShell
        title="Check your email"
        subtitle={<>If a {role.label} account exists for that address, we&apos;ve sent a password reset link.</>}
      >
        <div className="flex justify-center">
          <Link
            to={role.signInPath}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-[#2EB88A] px-7 text-[15px] font-semibold text-black no-underline transition-[filter] hover:brightness-110"
          >
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
            Back to sign in
          </Link>
        </div>
      </SpotlightShell>
    );
  }

  return (
    <SpotlightShell title="Reset password" subtitle="We'll email you a secure link to reset it.">
      <form onSubmit={handleSubmit(onSubmit)} className="mx-auto flex max-w-[480px] flex-col gap-3.5" noValidate>
        <SpotlightPill single>
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
          <SpotlightSubmit loading={isSubmitting} label="Send reset link" />
        </SpotlightPill>

        {errors.email && <p className="m-0 text-center text-sm text-red-400">{errors.email.message}</p>}

        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
          <Link to={role.signInPath} className={SPOTLIGHT_LINK}>
            Back to sign in
          </Link>
          <a href={`mailto:${brand.seller.billingEmail}`} className={SPOTLIGHT_LINK}>
            Contact IT Support
          </a>
        </div>
      </form>
    </SpotlightShell>
  );
}
