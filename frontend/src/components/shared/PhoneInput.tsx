import * as React from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  countryByCode,
  dialCodeOf,
  flagClass,
} from '@/lib/countries';

export { COUNTRIES, DEFAULT_COUNTRY, dialCodeOf } from '@/lib/countries';

/** Render a stored (country, number) pair as a single display string. */
export function formatPhone(number?: string | null, country?: string | null): string {
  if (!number) return '';
  return `${dialCodeOf(country)} ${number}`;
}

/** Flag sprite from flag-icons — bundled locally, no network request. */
export function Flag({ code, className }: { code?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(flagClass(code), 'h-3.5 w-5 shrink-0 rounded-[2px] bg-cover', className)}
    />
  );
}

/**
 * Searchable country picker. A native <select> cannot render an image per
 * option, so the trigger + listbox are built by hand to show real flags.
 */
function CountryPicker({
  value,
  onChange,
  disabled,
  /** 'phone' shows the dial code, 'address' shows the country name. */
  variant,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  variant: 'phone' | 'address';
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const selected = countryByCode(value) ?? countryByCode(DEFAULT_COUNTRY)!;

  /** Toggling always starts from an empty search — reset alongside the state
   *  change rather than in an effect, which would cost an extra render pass. */
  const setOpenState = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery('');
  };

  // Close on outside click / Escape.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenState(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenState(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  React.useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.dial.replace('+', '').startsWith(q.replace('+', ''))
    );
  }, [query]);

  const pick = (code: string) => {
    onChange(code);
    setOpenState(false);
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpenState(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={variant === 'phone' ? 'Country dial code' : 'Country'}
        className={cn(
          'flex h-full w-full items-center gap-1.5 px-2 text-sm outline-none disabled:cursor-not-allowed',
          variant === 'phone'
            ? 'shrink-0 border-r border-input bg-secondary/40'
            : 'h-10 justify-between rounded-lg border border-input bg-card px-3 shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Flag code={selected.code} />
          <span className="truncate">
            {variant === 'phone' ? selected.dial : selected.name}
          </span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-72 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {results.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">No match</li>
            )}
            {results.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.code === selected.code}
                  onClick={() => pick(c.code)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-secondary',
                    c.code === selected.code && 'bg-secondary font-medium'
                  )}
                >
                  <Flag code={c.code} />
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{c.dial}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Standalone country field for addresses — flag + full country name. */
export function CountrySelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  return <CountryPicker variant="address" value={value} onChange={onChange} disabled={disabled} />;
}

interface PhoneInputProps {
  /** ISO-3166 alpha-2 country code. */
  country: string;
  onCountryChange: (code: string) => void;
  /** National number, digits only — the dial code is stored separately. */
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Country selector + national number, rendered as one control. The number is
 * kept digit-only so the same value can be dialled, searched and compared
 * regardless of how the operator typed it.
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    {
      country,
      onCountryChange,
      value,
      onValueChange,
      onBlur,
      name,
      id,
      placeholder = '400 000 000',
      disabled,
      className,
    },
    ref
  ) => (
    <div
      className={cn(
        'flex h-10 w-full items-stretch rounded-lg border border-input bg-card shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <CountryPicker
        variant="phone"
        value={country || DEFAULT_COUNTRY}
        onChange={onCountryChange}
        disabled={disabled}
        className="w-[92px] shrink-0 overflow-visible rounded-l-lg"
      />
      <input
        ref={ref}
        id={id}
        name={name}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        disabled={disabled}
        placeholder={placeholder}
        value={value ?? ''}
        onBlur={onBlur}
        // Strip anything that is not a digit so stored numbers stay uniform.
        onChange={(e) => onValueChange(e.target.value.replace(/\D/g, ''))}
        className="h-full w-full min-w-0 rounded-r-lg bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
    </div>
  )
);
PhoneInput.displayName = 'PhoneInput';
