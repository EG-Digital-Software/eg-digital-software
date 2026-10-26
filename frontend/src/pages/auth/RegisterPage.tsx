import { useRef, useState, type ReactNode } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Clock, Camera, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/shared/states';
import { registerRequest, type RegisterPayload } from '@/api/auth';
import { apiErrorMessage } from '@/api/client';
import { titleCaseField } from '@/lib/input';
import {
  SpotlightShell,
  SpotlightPill,
  SpotlightPasswordRules,
  SPOTLIGHT_INPUT,
  SPOTLIGHT_LINK,
} from '@/components/auth/SpotlightShell';

type RoleCfg = {
  label: string;
  role: RegisterPayload['role'];
  client: boolean;
  subtitle: string;
};

const ROLE_MAP: Record<string, RoleCfg> = {
  client: {
    label: 'Customer',
    role: 'CLIENT',
    client: true,
    subtitle: 'Create your customer account to view statements and pay securely.',
  },
  employee: {
    label: 'Team',
    role: 'EMPLOYEE',
    client: false,
    subtitle: 'Set up your team workspace account.',
  },
};

/**
 * Client sign-ups bind to an existing customer via Customer ID; staff sign-ups
 * need a name instead. These used to be checked in the submit handler and
 * reported as toasts, so the offending field was never highlighted.
 */
const makeSchema = () =>
  z
    .object({
      firstName: z.string().min(1, 'First name is required'),
      lastName: z.string().min(1, 'Last name is required'),
      clientId: z.string().optional(),
      email: z.string().email('Enter a valid email'),
      password: z.string().min(8, 'At least 8 characters'),
      confirm: z.string(),
    })
    .superRefine((v, ctx) => {
      if (v.password !== v.confirm) {
        ctx.addIssue({ code: 'custom', message: 'Passwords do not match', path: ['confirm'] });
      }
    });
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

/** One pill-shaped field with a screen-reader label and its error/hint below. */
function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <SpotlightPill single>{children}</SpotlightPill>
      {error ? (
        <p className="m-0 px-5 text-xs text-red-400">{error}</p>
      ) : hint ? (
        <p className="m-0 px-5 text-xs text-[color:var(--eg-placeholder)]">{hint}</p>
      ) : null}
    </div>
  );
}

/** Solid green pill used for the page's main action. */
const PRIMARY_BUTTON =
  'inline-flex h-12 items-center justify-center gap-2 rounded-full border-0 bg-[#2EB88A] px-7 text-[15px] font-semibold text-black no-underline transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60';

export default function RegisterPage() {
  const { portal } = useParams();
  const cfg = portal ? ROLE_MAP[portal] : undefined;
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<FormValues>({ resolver: zodResolver(makeSchema()) });
  const password = watch('password') ?? '';

  if (!cfg) return <Navigate to="/" replace />;

  const loginPath = `/${portal}/login`;

  const onPickAvatar = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file');
    if (file.size > 3 * 1024 * 1024) return toast.error('Image must be under 3MB');
    setAvatar(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const onSubmit = async (values: FormValues) => {
    try {
      await registerRequest(
        {
          role: cfg.role,
          email: values.email,
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
          clientId: values.clientId,
        },
        avatar
      );
      setSubmitted(true);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Registration failed'));
    }
  };

  if (submitted) {
    return (
      <SpotlightShell
        title="Request submitted"
        subtitle={
          <>
            Your {cfg.label} account is awaiting EG approval. You&apos;ll be able to sign in once it&apos;s
            approved.
          </>
        }
      >
        <div className="flex flex-col items-center gap-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--eg-border)] px-4 py-2 text-sm text-[color:var(--eg-muted)]">
            <Clock className="h-4 w-4" /> Pending approval
          </span>
          <Link to={loginPath} className={PRIMARY_BUTTON}>
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
            Back to {cfg.label} sign in
          </Link>
        </div>
      </SpotlightShell>
    );
  }

  return (
    <SpotlightShell title="Create account" subtitle={cfg.subtitle}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3.5" noValidate>
        {/* Optional profile picture */}
        <div className="flex items-center justify-center gap-4 pb-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Upload profile picture"
            className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-dashed border-[color:var(--eg-border-focus)] bg-transparent p-0 text-[color:var(--eg-placeholder)] transition-colors hover:border-[#2EB88A] hover:text-[#2EB88A]"
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <Camera className="h-5 w-5" strokeWidth={1.8} />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => onPickAvatar(e.target.files?.[0])}
          />
          <div className="text-left">
            <p className="m-0 text-sm text-[color:var(--eg-text)]">Profile picture</p>
            <p className="m-0 text-xs text-[color:var(--eg-placeholder)]">Optional · PNG/JPG/WEBP, up to 3MB</p>
            {avatar && (
              <button
                type="button"
                onClick={() => {
                  setAvatar(null);
                  setAvatarPreview(null);
                }}
                className="mt-0.5 border-0 bg-transparent p-0 text-xs text-red-400 hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field id="firstName" label="First name" error={errors.firstName?.message}>
            <input id="firstName" placeholder="First name" className={SPOTLIGHT_INPUT} {...titleCaseField(register('firstName'))} />
          </Field>
          <Field id="lastName" label="Last name" error={errors.lastName?.message}>
            <input id="lastName" placeholder="Last name" className={SPOTLIGHT_INPUT} {...titleCaseField(register('lastName'))} />
          </Field>
        </div>

        {cfg.client && (
          <Field
            id="clientId"
            label="Customer ID (optional)"
            error={errors.clientId?.message}
            hint="e.g. EGD-2627-5000 · Leave blank to auto-link your account using your email address."
          >
            <input id="clientId" placeholder="Customer ID (optional)" className={SPOTLIGHT_INPUT} {...register('clientId')} />
          </Field>
        )}

        <Field id="email" label="Email" error={errors.email?.message}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={cfg.client ? 'you@company.com.au' : 'you@egdigital.com.au'}
            className={SPOTLIGHT_INPUT}
            {...register('email')}
          />
        </Field>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field id="password" label="Password" error={errors.password?.message}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Password"
              className={SPOTLIGHT_INPUT}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[color:var(--eg-placeholder)] transition-colors hover:text-[color:var(--eg-text)]"
            >
              {showPassword ? (
                <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.8} />
              ) : (
                <Eye className="h-[18px] w-[18px]" strokeWidth={1.8} />
              )}
            </button>
          </Field>
          <Field id="confirm" label="Confirm password" error={errors.confirm?.message}>
            <input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Confirm password"
              className={SPOTLIGHT_INPUT}
              {...register('confirm')}
            />
          </Field>
        </div>

        <SpotlightPasswordRules value={password} />

        <button type="submit" disabled={isSubmitting} className={`${PRIMARY_BUTTON} mt-1 w-full`}>
          {isSubmitting ? <Spinner /> : null}
          Submit for approval
        </button>

        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
          <span className="text-[color:var(--eg-placeholder)]">
            Already approved?{' '}
            <Link to={loginPath} className={SPOTLIGHT_LINK}>
              Sign in
            </Link>
          </span>
        </div>
      </form>
    </SpotlightShell>
  );
}
