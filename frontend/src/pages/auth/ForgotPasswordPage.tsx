import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail } from 'lucide-react';
import { forgotPasswordRequest, type Portal } from '@/api/auth';
import { toPortal, PORTAL_ROLEKEY } from '@/lib/portal';
import { Spinner } from '@/components/shared/states';
import {
  GraphiteShell,
  GRAPHITE_BUTTON,
  GRAPHITE_EYEBROW,
  GRAPHITE_INPUT,
} from '@/components/auth/GraphiteShell';

const schema = z.object({ email: z.string().email('Enter a valid email') });
type FormValues = z.infer<typeof schema>;

type RoleKey = 'super-admin' | 'client' | 'employee';

type RecoveryConfig = {
  label: string;
  portal: Portal;
  placeholder: string;
  /** Caption above the page headline. */
  eyebrow: string;
  /** Where "Back to sign in" goes. */
  signInPath: string;
};

const ROLES: Record<RoleKey, RecoveryConfig> = {
  'super-admin': {
    label: 'Admin',
    portal: 'SUPER_ADMIN',
    placeholder: 'admin@egdigital.com.au',
    eyebrow: 'Admin Console · Secure sign-in',
    signInPath: '/admin/login',
  },
  client: {
    label: 'Customer',
    portal: 'CLIENT',
    placeholder: 'you@company.com.au',
    eyebrow: 'Customer Portal · Secure sign-in',
    signInPath: '/',
  },
  employee: {
    label: 'Team',
    portal: 'EMPLOYEE',
    placeholder: 'you@egdigital.com.au',
    eyebrow: 'Team Workspace · Secure sign-in',
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

  return (
    <GraphiteShell eyebrow={role.eyebrow}>
      {sent ? (
        <>
          <div className="flex flex-col gap-2">
            <div className={GRAPHITE_EYEBROW}>Password recovery</div>
            <h2 className="m-0 text-[34px] !font-bold leading-[1.1] text-white">Check your email.</h2>
            <p className="m-0 text-[15px] text-[#a3abb9]">
              If a {role.label} account exists for that address, we&apos;ve sent a password reset link.
            </p>
          </div>
          <Link to={role.signInPath} className={GRAPHITE_BUTTON}>
            Back to sign in →
          </Link>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className={GRAPHITE_EYEBROW}>Password recovery · {role.label}</div>
            <h2 className="m-0 text-[34px] !font-bold leading-[1.1] text-white">Reset your password.</h2>
            <p className="m-0 text-[15px] text-[#a3abb9]">We&apos;ll email you a secure link to reset it.</p>
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
                  className={`${GRAPHITE_INPUT} pr-3.5`}
                  {...register('email')}
                />
              </div>
              {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
            </div>

            <button type="submit" disabled={isSubmitting} className={GRAPHITE_BUTTON}>
              {isSubmitting ? <Spinner /> : null}
              Send reset link {!isSubmitting && '→'}
            </button>
          </form>
        </>
      )}

      {!sent && (
        <div className="flex flex-wrap justify-between gap-2 border-t border-[#1f2430] pt-[18px] text-[13px] text-[#a3abb9]">
          <span>Remembered it?</span>
          <Link to={role.signInPath} className="font-semibold text-white hover:text-[#cbd5e1]">
            Back to sign in →
          </Link>
        </div>
      )}
    </GraphiteShell>
  );
}
