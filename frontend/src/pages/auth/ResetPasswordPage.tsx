import { useState } from 'react';
import { useSearchParams, useNavigate, useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { resetPasswordRequest } from '@/api/auth';
import { apiErrorMessage } from '@/api/client';
import { brand } from '@/config/brand';
import { toPortal, PORTAL_ROLEKEY } from '@/lib/portal';
import {
  SpotlightShell,
  SpotlightPill,
  SpotlightDivider,
  SpotlightPasswordRules,
  SpotlightSubmit,
  SPOTLIGHT_INPUT,
  SPOTLIGHT_LINK,
} from '@/components/auth/SpotlightShell';

const schema = z
  .object({
    password: z.string().min(8, 'At least 8 characters'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] });
type FormValues = z.infer<typeof schema>;

type RoleKey = 'super-admin' | 'client' | 'employee';

const ROLE_LABEL: Record<RoleKey, string> = {
  'super-admin': 'Admin',
  client: 'Customer',
  employee: 'Team',
};

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const routeParams = useParams<{ portal?: string }>();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  const portal = toPortal(routeParams.portal);
  const roleKey = PORTAL_ROLEKEY[portal] as RoleKey;
  const loginPath = `/${portal}/login`;

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

  const fieldError = errors.password?.message ?? errors.confirm?.message;

  return (
    <SpotlightShell
      title="Set new password"
      subtitle={`Choose a strong password for your ${ROLE_LABEL[roleKey]} account.`}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3.5" noValidate>
        {!token && (
          <p className="m-0 text-center text-sm text-red-400">
            Missing reset token. Please use the link from your email.
          </p>
        )}

        <SpotlightPill>
          <label htmlFor="password" className="sr-only">
            New password
          </label>
          <input
            id="password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="New password"
            className={SPOTLIGHT_INPUT}
            {...register('password')}
          />
          <SpotlightDivider />
          <label htmlFor="confirm" className="sr-only">
            Confirm password
          </label>
          <input
            id="confirm"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Confirm password"
            className={SPOTLIGHT_INPUT}
            {...register('confirm')}
          />
          <div className="flex items-center justify-end gap-1.5 sm:contents">
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[color:var(--eg-placeholder)] transition-colors hover:text-[color:var(--eg-text)]"
            >
              {show ? <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <Eye className="h-[18px] w-[18px]" strokeWidth={1.8} />}
            </button>
            <SpotlightSubmit loading={isSubmitting} disabled={!token} label="Reset password" />
          </div>
        </SpotlightPill>

        {fieldError && <p className="m-0 text-center text-sm text-red-400">{fieldError}</p>}
        <SpotlightPasswordRules value={newPassword} />

        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
          <Link to={loginPath} className={SPOTLIGHT_LINK}>
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
