import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { subdivisionsOf } from '@/lib/subdivisions';

/**
 * State / province / region field driven by the selected country.
 *
 * When the country has a known list, this is a dropdown; otherwise it degrades
 * to a free-text input so addresses in unlisted countries still work. Changing
 * the country to one whose list doesn't contain the current value clears it —
 * but never on first render, so editing an existing record keeps its value even
 * if it predates (or doesn't match) our list.
 */
export function StateSelect({
  countryCode,
  value,
  onChange,
  disabled,
  className,
}: {
  countryCode?: string | null;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const options = subdivisionsOf(countryCode);
  const prevCountry = React.useRef(countryCode);

  React.useEffect(() => {
    if (prevCountry.current === countryCode) return;
    prevCountry.current = countryCode;
    // Real country change: drop a state that doesn't belong to the new country
    // (an unlisted country has no options, so a stale value is cleared too).
    if (value && !subdivisionsOf(countryCode).some((s) => s.value === value)) {
      onChange('');
    }
  }, [countryCode, value, onChange]);

  // No list for this country — plain editable text field.
  if (options.length === 0) {
    return (
      <Input
        disabled={disabled}
        className={className}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Existing value that isn't in the list (legacy data / different spelling) is
  // preserved as its own option so editing never silently drops it.
  const known = options.some((s) => s.value === value);

  return (
    <div className="relative">
      <select
        disabled={disabled}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'flex h-10 w-full appearance-none items-center rounded-lg border border-input bg-card px-3 pr-9 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        <option value="">Select state…</option>
        {value && !known && <option value={value}>{value}</option>}
        {options.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
