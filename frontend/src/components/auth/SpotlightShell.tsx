import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Moon, Sun } from 'lucide-react';
import { brand } from '@/config/brand';
import { Logo } from '@/components/layout/Logo';
import { Spinner } from '@/components/shared/states';
import { cn } from '@/lib/utils';
import hummingbird from '@/assets/eg-hummingbird.png';

/** Brand green used for the spotlight dots, glow and submit button. */
const ACCENT = '#2EB88A';

type Theme = 'dark' | 'light';

/** Colour tokens per theme; the shell sets them as CSS variables and every
 *  piece below reads them, so the toggle restyles the whole page at once. */
const THEMES: Record<Theme, Record<string, string>> = {
  dark: {
    '--eg-bg': '#000000',
    '--eg-dot': '#1C1C1C',
    '--eg-text': '#FFFFFF',
    '--eg-muted': '#B5B5B5',
    '--eg-faint': '#5A5A5A',
    '--eg-border': '#3A3A3A',
    '--eg-border-focus': '#5A5A5A',
    '--eg-placeholder': '#8A8A8A',
    '--eg-toggle': '#3FD9A4',
    '--eg-toggle-bg': 'rgba(46,184,138,0.2)',
    '--eg-toggle-border': 'rgba(46,184,138,0.8)',
  },
  light: {
    '--eg-bg': '#FFFFFF',
    '--eg-dot': '#E4E7EB',
    '--eg-text': '#0B223B',
    '--eg-muted': '#4B5563',
    '--eg-faint': '#9CA3AF',
    '--eg-border': '#D1D5DB',
    '--eg-border-focus': '#9CA3AF',
    '--eg-placeholder': '#9CA3AF',
    '--eg-toggle': '#4B5563',
    '--eg-toggle-bg': '#FFFFFF',
    '--eg-toggle-border': '#D1D5DB',
  },
};

const THEME_KEY = 'eg-auth-theme';

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Underline-free footer link under the sign-in pill. */
export const SPOTLIGHT_LINK =
  'text-[color:var(--eg-muted)] no-underline transition-colors hover:text-[color:var(--eg-text)]';

/** Text input sitting inside the sign-in pill. */
export const SPOTLIGHT_INPUT =
  'eg-input h-12 w-full min-w-0 rounded-full border-0 bg-transparent px-5 font-[inherit] text-base text-[color:var(--eg-text)] outline-none placeholder:text-[color:var(--eg-placeholder)] sm:w-auto sm:flex-1';

const KEYFRAMES = `
@keyframes egHover{0%,100%{transform:translate3d(0,0,0) rotate(0deg)}50%{transform:translate3d(0,-14px,0) rotate(-2deg)}}
@keyframes egShadow{0%,100%{transform:scaleX(1);opacity:.5}50%{transform:scaleX(.7);opacity:.25}}
@keyframes egSpot{0%{-webkit-mask-position:10% 20%;mask-position:10% 20%}25%{-webkit-mask-position:85% 30%;mask-position:85% 30%}50%{-webkit-mask-position:70% 85%;mask-position:70% 85%}75%{-webkit-mask-position:20% 75%;mask-position:20% 75%}100%{-webkit-mask-position:10% 20%;mask-position:10% 20%}}
.eg-float{animation:egHover 4s ease-in-out infinite;will-change:transform}
.eg-shadow{animation:egShadow 4s ease-in-out infinite}
.eg-spot{-webkit-mask-image:radial-gradient(circle,#000 0,rgba(0,0,0,0) 260px);mask-image:radial-gradient(circle,#000 0,rgba(0,0,0,0) 260px);-webkit-mask-size:200% 200%;mask-size:200% 200%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;animation:egSpot 14s ease-in-out infinite}
.eg-input:-webkit-autofill,.eg-input:-webkit-autofill:hover,.eg-input:-webkit-autofill:focus,.eg-input:autofill{-webkit-text-fill-color:var(--eg-text);caret-color:var(--eg-text);-webkit-box-shadow:0 0 0 1000px var(--eg-bg) inset;box-shadow:0 0 0 1000px var(--eg-bg) inset;transition:background-color 9999s ease-in-out 0s}
@media (prefers-reduced-motion:reduce){.eg-float,.eg-shadow,.eg-spot{animation:none}}
`;

/** Round green arrow button that submits the sign-in pill. */
export function SpotlightSubmit({
  loading,
  disabled,
  label = 'Sign in',
}: {
  loading?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      aria-label={label}
      className="flex h-12 w-12 shrink-0 items-center justify-center self-end rounded-full border-0 text-black transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
      style={{ background: ACCENT }}
    >
      {loading ? <Spinner /> : <ArrowRight className="h-5 w-5" strokeWidth={2.4} />}
    </button>
  );
}

/** Divider between the email and password fields (hidden when stacked on phones). */
export function SpotlightDivider() {
  return <span aria-hidden="true" className="mx-5 h-px shrink-0 bg-[color:var(--eg-border)] sm:mx-0 sm:h-7 sm:w-px" />;
}

/** "Wing Beat + Spotlight" sign-in layout: black dot grid with a drifting green
 *  spotlight, a hovering hummingbird, headline, then `children` (the pill form
 *  and its links). Used by the portal start page and the per-portal login.
 *  Dark by default; the top-right toggle switches to light and is remembered. */
export function SpotlightShell({
  title = 'Sign in',
  subtitle = 'Always on. Always ready.',
  children,
}: {
  title?: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const year = new Date().getFullYear();
  const [theme, setTheme] = useState<Theme>(readTheme);
  const dark = theme === 'dark';

  const toggleTheme = () => {
    const next: Theme = dark ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked (private mode) — the choice just won't be remembered.
    }
  };

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center gap-[30px] overflow-hidden bg-[color:var(--eg-bg)] px-4 pb-24 pt-20 text-[color:var(--eg-text)] transition-colors duration-300 sm:pb-[100px] sm:pt-16"
      style={{ ...THEMES[theme], fontFamily: 'Barlow, system-ui, sans-serif', colorScheme: theme } as CSSProperties}
    >
      <style>{KEYFRAMES}</style>

      {/* Backdrop: faint dot grid + green dots revealed by a moving spotlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(var(--eg-dot) 1.2px, rgba(0,0,0,0) 1.2px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div
        aria-hidden="true"
        className="eg-spot pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(${ACCENT} 1.6px, rgba(0,0,0,0) 1.6px)`,
          backgroundSize: '24px 24px',
        }}
      />

      <Link
        to="/"
        aria-label={`${brand.companyName} home`}
        className="absolute left-3 top-3 z-[1] no-underline sm:left-6 sm:top-5"
      >
        <Logo light={dark} className="text-[22px] sm:text-[26px]" />
      </Link>

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={dark ? 'Light mode' : 'Dark mode'}
        className="absolute right-3 top-3 z-[1] flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--eg-toggle-border)] bg-[color:var(--eg-toggle-bg)] text-[color:var(--eg-toggle)] transition-[color,border-color,filter] hover:border-[color:var(--eg-toggle)] hover:brightness-125 sm:right-6 sm:top-6"
      >
        {dark ? <Sun className="h-5 w-5" strokeWidth={2} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.8} />}
      </button>

      {/* Hummingbird */}
      <div aria-hidden="true" className="relative z-[1] -mb-1.5 h-[110px] w-[150px] sm:h-[140px] sm:w-[200px]">
        <div className="eg-float absolute inset-0 flex items-end justify-center">
          {dark ? (
            <img src={hummingbird} alt="" className="relative block w-[105px] sm:w-[140px]" />
          ) : (
            <img src={brand.icon} alt="" className="relative block w-[96px] sm:w-[124px]" />
          )}
        </div>
        <div
          className="eg-shadow absolute bottom-[-12px] left-[50px] right-[50px] h-2.5 rounded-[50%]"
          style={{ background: 'radial-gradient(closest-side, rgba(46,184,138,0.45), rgba(46,184,138,0))' }}
        />
      </div>

      <div className="relative z-[1] flex flex-col gap-2 text-center">
        <h1 className="m-0 text-[36px] font-semibold tracking-[-0.02em] text-[color:var(--eg-text)] sm:text-[44px]">{title}</h1>
        <p className="m-0 mx-auto max-w-[520px] text-[17px] text-[color:var(--eg-muted)]">{subtitle}</p>
      </div>

      <div className="relative z-[1] w-full max-w-[640px]">{children}</div>

      {/* Footer — the copyright doubles as the hidden admin entry. */}
      <Link
        to="/admin/login"
        aria-label="EG staff login"
        className="absolute bottom-6 z-[1] text-xs uppercase tracking-[0.12em] text-[color:var(--eg-faint)] no-underline transition-colors hover:text-[color:var(--eg-muted)]"
      >
        © {year} {brand.companyName} By Eloma Group — {brand.legal.country}
      </Link>
    </div>
  );
}

/** The bordered pill that holds email, password and the submit arrow. Stacks
 *  into a rounded card on narrow screens. */
export function SpotlightPill({ children, single = false }: { children: ReactNode; /** One field: stay a pill on phones too. */ single?: boolean }) {
  return (
    <div
      className={cn(
        'flex gap-1.5 border border-[color:var(--eg-border)] bg-[color:var(--eg-bg)] p-1.5 transition-colors focus-within:border-[color:var(--eg-border-focus)]',
        single
          ? 'flex-row items-center rounded-full [&>button]:self-auto [&>input]:flex-1'
          : 'flex-col rounded-[28px] sm:flex-row sm:items-center sm:rounded-full',
      )}
    >
      {children}
    </div>
  );
}

/** Live checklist so the password rule is visible before submitting. */
export function SpotlightPasswordRules({ value }: { value: string }) {
  if (!value) return null;
  const rules = [
    { label: 'At least 8 characters', ok: value.length >= 8 },
    { label: 'Contains a letter', ok: /[a-zA-Z]/.test(value) },
    { label: 'Contains a number', ok: /\d/.test(value) },
  ];
  return (
    <ul className="m-0 flex list-none flex-wrap justify-center gap-x-5 gap-y-1.5 p-0 text-[13px]">
      {rules.map((r) => (
        <li
          key={r.label}
          className={cn(
            'flex items-center gap-1.5',
            r.ok ? 'text-[#2EB88A]' : 'text-[color:var(--eg-placeholder)]',
          )}
        >
          <span
            aria-hidden
            className={cn('inline-block h-1.5 w-1.5 rounded-full', r.ok ? 'bg-[#2EB88A]' : 'bg-[color:var(--eg-border)]')}
          />
          {r.label}
        </li>
      ))}
    </ul>
  );
}
