import { useRef, useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, MailCheck, Clock, Camera, Mail, Lock, User, Hash, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/misc';
import { Spinner } from '@/components/shared/states';
import { registerRequest, type RegisterPayload } from '@/api/auth';
import { apiErrorMessage } from '@/api/client';
import { titleCaseField } from '@/lib/input';
import {
  AuthShell,
  AuthField,
  AuthButton,
  type AuthAccent,
  type AuthTab,
  type AuthVariant,
  PasswordRules,
} from '@/components/auth/AuthShell';

type RoleCfg = {
  label: string;
  role: RegisterPayload['role'];
  client: boolean;
  welcome: string;
  subline: string;
  accent: AuthAccent;
  variant: AuthVariant;
};

const ROLE_MAP: Record<string, RoleCfg> = {
  client: {
    label: 'Client',
    role: 'CLIENT',
    client: true,
    welcome: 'Manage your invoices & licences online',
    subline: 'Create your EG Digital client account to view statements and pay securely.',
    accent: { from: '#0d9488', to: '#10b981' }, // teal → emerald
    variant: 'client',
  },
  supplier: {
    label: 'Supplier',
    role: 'SUPPLIER',
    client: false,
    welcome: 'Partner with EG Digital as a supplier',
    subline: 'Track orders, stock and fulfilment with tools built for supply partners.',
    accent: { from: '#ea580c', to: '#f59e0b' }, // orange → amber
    variant: 'supplier',
  },
  employee: {
    label: 'Employee',
    role: 'EMPLOYEE',
    client: false,
    welcome: 'Set up your EG Digital workspace',
    subline: 'Access customers, licences and internal tools in one focused place.',
    accent: { from: '#0284c7', to: '#38bdf8' }, // sky blue
    variant: 'employee',
  },
};

/**
 * Client sign-ups bind to an existing customer via Client ID; staff sign-ups
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

  const tabs: AuthTab[] = [
    { label: 'Sign In', to: `/${portal}/login` },
    { label: 'Sign Up', to: `/${portal}/register`, active: true },
    { label: 'Password recovery', to: `/${portal}/forgot-password` },
  ];

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
      <AuthShell tabs={tabs} welcome={cfg.welcome} subline={cfg.subline} accent={cfg.accent} variant={cfg.variant}>
        <div className="stagger text-center">
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg"
            style={{ background: `linear-gradient(120deg, ${cfg.accent.from}, ${cfg.accent.to})` }}
          >
            <MailCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Request submitted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your {cfg.label} account is{' '}
            <span className="font-medium text-foreground">awaiting Admin approval</span>. You&apos;ll
            be able to sign in once it&apos;s approved.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" /> Pending approval
          </div>
          <Button asChild className="mt-6 w-full" size="lg">
            <Link to={`/${portal}/login`}>Back to {cfg.label} login</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell tabs={tabs} welcome={cfg.welcome} subline={cfg.subline} accent={cfg.accent} variant={cfg.variant}>
      <div className="stagger">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">Sign Up</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Accounts require Admin approval before first sign-in.
            </p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: `${cfg.accent.from}14`, color: cfg.accent.from }}
          >
            {cfg.label}
          </span>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16 ring-2 ring-white">
                {avatarPreview && <AvatarImage src={avatarPreview} alt="" />}
                <AvatarFallback className="text-lg">
                  <Camera className="h-5 w-5 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card text-white shadow-sm"
                style={{ background: cfg.accent.from }}
                aria-label="Upload profile picture"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => onPickAvatar(e.target.files?.[0])}
              />
            </div>
            <div>
              <p className="text-sm font-medium">Profile picture</p>
              <p className="text-xs text-muted-foreground">Optional · PNG/JPG/WEBP, up to 3MB</p>
              {avatar && (
                <button
                  type="button"
                  onClick={() => {
                    setAvatar(null);
                    setAvatarPreview(null);
                  }}
                  className="mt-1 text-xs font-medium text-destructive hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <AuthField id="firstName" icon={User} {...titleCaseField(register('firstName'))} />
              {errors.firstName && (
                <p className="text-xs text-destructive">{errors.firstName.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <AuthField id="lastName" icon={User} {...titleCaseField(register('lastName'))} />
              {errors.lastName && (
                <p className="text-xs text-destructive">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          {cfg.client && (
            <div className="space-y-1.5">
              <Label htmlFor="clientId">Client ID (Optional)</Label>
              <AuthField id="clientId" icon={Hash} placeholder="EGD-2627-5000" {...register('clientId')} />
              {errors.clientId ? (
                <p className="text-xs text-destructive">{errors.clientId.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Leave blank to auto-link your account using your email address.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <AuthField
              id="email"
              icon={Mail}
              type="email"
              autoComplete="email"
              placeholder="you@company.com.au"
              {...register('email')}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <AuthField
              id="password"
              icon={Lock}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Create a password"
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
            <PasswordRules value={password} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <AuthField
              id="confirm"
              icon={Lock}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              {...register('confirm')}
            />
            {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
          </div>

          <AuthButton type="submit" accent={cfg.accent} disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : null}
            Submit for approval
            {!isSubmitting && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
          </AuthButton>
        </form>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already approved?{' '}
          <Link to={`/${portal}/login`} className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
