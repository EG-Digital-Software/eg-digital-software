import * as React from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, type LucideIcon } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';
import { PlatformScene, type AuthVariant } from './PlatformScene';

export type { AuthVariant };

export type AuthAccent = {
  /** Gradient start (hex). */
  from: string;
  /** Gradient end (hex). */
  to: string;
};

export type AuthTab = {
  label: string;
  to: string;
  active?: boolean;
  disabled?: boolean;
};

export type AuthShellProps = {
  /** Tab row at the top of the form. */
  tabs: AuthTab[];
  /** Headline shown on the brand panel. */
  welcome: string;
  /** Supporting copy under the headline. */
  subline?: string;
  /** Per-role accent colours used across the form + illustration. */
  accent: AuthAccent;
  /** Which role-specific illustration to show. */
  variant?: AuthVariant;
  /** The form / body. */
  children: ReactNode;
};

export function AuthShell({ tabs, welcome, subline, accent, variant, children }: AuthShellProps) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* ---------- Left: form (full height) ---------- */}
      <div className="relative flex items-center justify-center overflow-hidden bg-background px-6 py-10 sm:px-10">
        {/* soft ambient tint */}
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full opacity-10 blur-3xl"
          style={{ background: accent.from }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 right-0 h-72 w-72 rounded-full opacity-10 blur-3xl"
          style={{ background: accent.to }}
        />

        <div className="animate-slide-up-lg relative z-10 w-full max-w-md">
          <div className="mb-8">
            <Logo className="text-2xl" />
          </div>

          {/* tabs */}
          <div className="mb-7 flex items-center gap-1 border-b border-border">
            {tabs.map((t) =>
              t.disabled ? (
                <span
                  key={t.label}
                  className="cursor-not-allowed px-3 pb-3 text-sm font-medium text-muted-foreground/40"
                  title="Not available for this portal"
                >
                  {t.label}
                </span>
              ) : (
                <Link
                  key={t.label}
                  to={t.to}
                  className={cn(
                    'relative px-3 pb-3 text-sm font-medium transition-colors',
                    t.active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t.label}
                  {t.active && (
                    <span
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                      style={{ background: `linear-gradient(90deg, ${accent.from}, ${accent.to})` }}
                    />
                  )}
                </Link>
              )
            )}
          </div>

          {children}
        </div>
      </div>

      {/* ---------- Right: brand + animated illustration (white, full height) ---------- */}
      <aside className="relative hidden flex-col items-center justify-center overflow-hidden border-l border-border bg-white p-12 lg:flex">
        {/* drifting accent glows (subtle, on white) */}
        <div
          className="animate-aurora pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ background: accent.from }}
        />
        <div
          className="animate-float-slow pointer-events-none absolute -bottom-32 right-1/4 h-[28rem] w-[28rem] rounded-full opacity-20 blur-3xl"
          style={{ background: accent.to }}
        />

        <div className="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
          <img
            src={brand.icon}
            alt={brand.companyName}
            className="animate-float mb-5 h-14 w-auto object-contain"
          />
          <h2
            className="text-3xl font-bold leading-tight tracking-tight"
            style={{ color: brand.colors.navy }}
          >
            {welcome}
          </h2>
          {subline && <p className="mt-3 max-w-md text-muted-foreground">{subline}</p>}

          <div className="mt-8 w-full">
            <PlatformScene accent={accent} variant={variant} />
          </div>

          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4" style={{ color: accent.from }} /> Secure, role-based
            access · en-AU · AUD
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reusable premium field with a leading icon + focus glow.            */
/* ------------------------------------------------------------------ */

type AuthFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  icon: LucideIcon;
  /** Optional trailing element (e.g. show/hide password toggle). */
  trailing?: ReactNode;
};

export const AuthField = React.forwardRef<HTMLInputElement, AuthFieldProps>(
  ({ icon: Icon, trailing, className, ...props }, ref) => (
    <div className="group relative">
      <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
      <input
        ref={ref}
        className={cn(
          'h-12 w-full rounded-xl border border-input bg-secondary/50 pl-10 pr-3 text-sm shadow-sm outline-none transition-all placeholder:text-muted-foreground',
          'focus:border-primary/60 focus:bg-white focus:ring-4 focus:ring-primary/10',
          trailing && 'pr-11',
          className
        )}
        {...props}
      />
      {trailing && <div className="absolute right-2.5 top-1/2 -translate-y-1/2">{trailing}</div>}
    </div>
  )
);
AuthField.displayName = 'AuthField';

/* ------------------------------------------------------------------ */
/* Gradient CTA with an animated shine sweep.                          */
/* ------------------------------------------------------------------ */

type AuthButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  accent: AuthAccent;
};

export function AuthButton({ accent, className, children, ...props }: AuthButtonProps) {
  return (
    <button
      className={cn(
        'group relative inline-flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-sm font-semibold text-white shadow-lg transition-all',
        'hover:shadow-xl hover:brightness-105 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25',
        className
      )}
      style={{ background: `linear-gradient(120deg, ${accent.from}, ${accent.to})` }}
      {...props}
    >
      <span className="pointer-events-none absolute inset-0 -z-0">
        <span className="animate-shine absolute inset-y-0 left-0 w-1/3 bg-white/25 blur-md" />
      </span>
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
}

/**
 * Live password checklist. Shown wherever a new password is chosen so the rule
 * is visible before the form is submitted rather than after it fails.
 */
export function PasswordRules({ value }: { value: string }) {
  if (!value) return null;
  const rules = [
    { label: 'At least 8 characters', ok: value.length >= 8 },
    { label: 'Contains a letter', ok: /[a-zA-Z]/.test(value) },
    { label: 'Contains a number', ok: /\d/.test(value) },
  ];
  return (
    <ul className="space-y-1 pt-1">
      {rules.map((r) => (
        <li
          key={r.label}
          className={`flex items-center gap-1.5 text-xs ${
            r.ok ? 'text-emerald-600' : 'text-muted-foreground'
          }`}
        >
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              r.ok ? 'bg-emerald-500' : 'bg-muted-foreground/40'
            }`}
          />
          {r.label}
        </li>
      ))}
    </ul>
  );
}
