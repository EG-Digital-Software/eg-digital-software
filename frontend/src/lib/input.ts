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

/** Letters and digits with the separators registration numbers use (space / -). */
export const toAlnum = (v: string): string => v.replace(/[^A-Za-z0-9\s/-]/g, '');

export type Kind = 'int' | 'decimal' | 'abn' | 'letters' | 'email' | 'alnum';

const CLEAN: Record<Kind, (v: string) => string> = {
  int: toDigits,
  decimal: toDecimal,
  abn: toDigitsSpaced,
  letters: toLetters,
  email: toEmail,
  alnum: toAlnum,
};

const WARNING: Record<Kind, string> = {
  int: 'Only numbers are allowed here',
  decimal: 'Only numbers are allowed here',
  abn: 'Only numbers are allowed here',
  letters: 'Only letters are allowed here',
  email: 'That character is not allowed in an email address',
  alnum: 'Only letters and numbers are allowed here',
};

const INPUT_MODE: Record<Kind, 'numeric' | 'decimal' | 'text' | 'email'> = {
  int: 'numeric',
  decimal: 'decimal',
  abn: 'numeric',
  letters: 'text',
  email: 'email',
  alnum: 'text',
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

/**
 * Title Case a value: capital first letter of every word, the rest lower —
 * independent of Caps Lock. Word breaks are spaces and the separators addresses
 * use (/ - . ). Digits and symbols pass through, so "12/3a george st" becomes
 * "12/3A George St".
 *
 * Apostrophes are handled by name convention rather than as a blanket break:
 * a single-letter prefix keeps the Irish/Scottish capital ("o'brien" →
 * "O'Brien", "d'angelo" → "D'Angelo"), but a possessive/contraction stays lower
 * after the apostrophe ("ruby's" → "Ruby's", not "Ruby'S").
 */
const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function toTitleCase(v: string): string {
  return v.toLowerCase().replace(/\p{L}+(?:'\p{L}+)?/gu, (word) => {
    const apos = word.indexOf("'");
    if (apos === -1) return cap(word);
    const before = word.slice(0, apos);
    const after = word.slice(apos + 1);
    // O'Brien / D'Souza capitalise both sides; Ruby's / John's keep the suffix.
    return before.length === 1 ? `${cap(before)}'${cap(after)}` : `${cap(before)}'${after}`;
  });
}

/**
 * Wrap a `register()` so the field is Title-Cased as the operator types, however
 * Caps Lock is set. Length never changes, so the caret stays put. Spread it in
 * place of `{...register(name)}`.
 */
export function titleCaseField(registration: UseFormRegisterReturn): UseFormRegisterReturn {
  return {
    ...registration,
    onChange: (e: RegisterChangeEvent) => {
      e.target.value = toTitleCase(e.target.value as string);
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
