import { toast } from 'sonner';
import type { UseFormRegisterReturn } from 'react-hook-form';

type RegisterChangeEvent = Parameters<UseFormRegisterReturn['onChange']>[0];

/** Keep digits only — everything else (letters, symbols, spaces) is dropped. */
export const toDigits = (v: string): string => v.replace(/\D/g, '');

/** Digits with optional single-space grouping — for ABN/ACN entry. */
export const toDigitsSpaced = (v: string): string => v.replace(/[^\d ]/g, '');

/** Digits with a single decimal point — for money and rate fields. */
export function toDecimal(v: string): string {
  let s = v.replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
  return s;
}

/** Letters and the punctuation real names carry (space, hyphen, apostrophe, dot). */
export const toLetters = (v: string): string => v.replace(/[^\p{L}\s'.-]/gu, '');

/** Characters that are valid inside an email address. */
export const toEmail = (v: string): string => v.replace(/[^a-zA-Z0-9@._%+-]/g, '');

type Kind = 'int' | 'decimal' | 'abn' | 'letters' | 'email';

const CLEAN: Record<Kind, (v: string) => string> = {
  int: toDigits,
  decimal: toDecimal,
  abn: toDigitsSpaced,
  letters: toLetters,
  email: toEmail,
};

const WARNING: Record<Kind, string> = {
  int: 'Only numbers are allowed here',
  decimal: 'Only numbers are allowed here',
  abn: 'Only numbers are allowed here',
  letters: 'Only letters are allowed here',
  email: 'That character is not allowed in an email address',
};

const INPUT_MODE: Record<Kind, 'numeric' | 'decimal' | 'text' | 'email'> = {
  int: 'numeric',
  decimal: 'decimal',
  abn: 'numeric',
  letters: 'text',
  email: 'email',
};

/**
 * Wrap a react-hook-form `register()` so the field can only ever hold the right
 * kind of value. Disallowed characters are stripped before RHF reads the field
 * — whether typed or pasted — and a single (de-duplicated) warning toast tells
 * the operator why the keystroke did nothing. Spread it in place of
 * `{...register(name)}`.
 */
export function guardedField(
  registration: UseFormRegisterReturn,
  kind: Kind
): UseFormRegisterReturn & { inputMode: 'numeric' | 'decimal' | 'text' | 'email' } {
  const clean = CLEAN[kind];
  return {
    ...registration,
    inputMode: INPUT_MODE[kind],
    onChange: (e: RegisterChangeEvent) => {
      const raw = e.target.value as string;
      const cleaned = clean(raw);
      if (cleaned !== raw) {
        // A fixed id means rapid typing refreshes one toast instead of stacking.
        toast.warning(WARNING[kind], { id: 'field-guard' });
      }
      e.target.value = cleaned;
      return registration.onChange(e);
    },
  };
}

/** Back-compat alias — numeric fields are the common case. */
export function numericField(
  registration: UseFormRegisterReturn,
  kind: 'int' | 'decimal' | 'abn' = 'int'
) {
  return guardedField(registration, kind);
}
