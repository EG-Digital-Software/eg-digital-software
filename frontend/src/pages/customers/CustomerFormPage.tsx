import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray, Controller, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Building2,
  Receipt,
  Package,
  Contact,
  MapPin,
  Search,
  Users,
  Pencil,
  Server,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { customerApi, productApi, geoApi, abnApi } from '@/api/resources';
import type { AbnLookupResult, AddressSuggestion } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/shared/states';
import { PhoneInput, CountrySelect, phoneComplete } from '@/components/shared/PhoneInput';
import { StateSelect } from '@/components/shared/StateSelect';
import {
  DEFAULT_COUNTRY,
  DEFAULT_COUNTRY_NAME,
  countryByCode,
  countryCodeByName,
  countryName,
} from '@/lib/countries';
import { BUSINESS_TYPES, INVOICE_TERMS, PAYMENT_METHODS, formatAbn, isValidAbn } from '@/lib/customer';
import { companyFieldsFor } from '@/lib/company';
import { numericField, guardedField, titleCaseField, toTitleCase } from '@/lib/input';
import { formatCurrency, cn } from '@/lib/utils';
import type { Address } from '@/types';

// ── Validation ─────────────────────────────────────────────
// Mirrors backend/src/validators/customer.validator.ts so the operator sees the
// same rules the API enforces.

const addressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  suburb: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  /** ISO-3166 alpha-2 in the form; sent to the API as the country name. */
  country: z.string().optional(),
});

const optionalEmail = z.string().email('Enter a valid email').optional().or(z.literal(''));

const schema = z
  .object({
    // Company Information
    /** ISO-3166 alpha-2 registration country. */
    registrationCountry: z.string().default(DEFAULT_COUNTRY),
    /** Country-specific identifiers keyed by field; validated in superRefine. */
    companyIdentifiers: z.record(z.string()).default({}),
    companyName: z.string().optional(),
    // A business can trade under several names — the ABR hands back every one
    // it holds. Objects rather than bare strings because useFieldArray keys on
    // a stable field id.
    tradingNames: z.array(z.object({ value: z.string() })).optional(),
    businessType: z.string().optional(),
    principalAddress: addressSchema.optional(),
    billingAddress: addressSchema.optional(),
    sameAsPrincipal: z.boolean().optional(),

    // Contact Information
    contactPerson: z.string().optional(),
    contactEmail: optionalEmail,
    contactMobile: z.string().optional(),
    contactMobileCountry: z.string().optional(),
    contactPosition: z.string().optional(),
    authorized: z.enum(['yes', 'no']).default('no'),
    authorizedPerson: z.string().optional(),
    authorizedEmail: optionalEmail,
    authorizedMobile: z.string().optional(),
    authorizedMobileCountry: z.string().optional(),

    // Invoicing Details
    invoiceCustomer: z.string().optional(),
    billingContactPerson: z.string().optional(),
    billingContactNumber: z.string().optional(),
    billingContactNumberCountry: z.string().optional(),
    billingEmail: optionalEmail,
    creditScore: z
      .string()
      .optional()
      .refine((v) => {
        if (!v?.trim()) return true;
        const n = Number(v);
        return Number.isInteger(n) && n >= 0 && n <= 1200;
      }, 'Credit score must be a whole number between 0 and 1200'),

    // Either a preset code (INVOICE_TERMS), or the sentinel 'MANUAL' — in which
    // case the free-text term lives in invoiceTermCustom until submit.
    invoiceTerm: z.string().optional(),
    invoiceTermCustom: z.string().optional(),
    paymentMethod: z.string().optional(),

    accountStatus: z.enum(['ACTIVE', 'DORMANT', 'SUSPENDED']).default('ACTIVE'),

    // Customer Credential — the portal login the admin provisions for this
    // customer. Email + password; password left blank on edit keeps the current.
    credential: z.object({
      email: optionalEmail,
      password: z.string().optional(),
    }),

    sameAsContactInfo: z.boolean().optional(),

    directors: z
      .array(
        z.object({
          firstName: z.string().optional(),
          middleName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().optional(),
          contactNumber: z.string().optional(),
          contactNumberCountry: z.string().optional(),
        })
      )
      .optional(),

    assignedProducts: z
      .array(
        z.object({
          productId: z.string().min(1, 'Select a product'),
          quantity: z.coerce.number().int().positive(),
          price: z.coerce.number().min(0).optional(),
          licence: z.string().optional(),
          issueDate: z.string().optional(),
          expiryDate: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .optional(),
  })
  .refine((v) => v.authorized !== 'no' || !!v.authorizedPerson?.trim(), {
    message: 'Required when Authorised is No',
    path: ['authorizedPerson'],
  })
  // A manually entered invoice term must actually be typed in.
  .refine((v) => v.invoiceTerm !== 'MANUAL' || !!v.invoiceTermCustom?.trim(), {
    message: 'Enter the invoice term',
    path: ['invoiceTermCustom'],
  })
  // A phone number, once entered, must be a full 10 digits.
  .refine((v) => phoneComplete(v.contactMobile), {
    message: 'Phone number must be 10 digits',
    path: ['contactMobile'],
  })
  .refine((v) => phoneComplete(v.authorizedMobile), {
    message: 'Phone number must be 10 digits',
    path: ['authorizedMobile'],
  })
  .refine((v) => phoneComplete(v.billingContactNumber), {
    message: 'Phone number must be 10 digits',
    path: ['billingContactNumber'],
  })
  // A portal password, once typed, must be at least 8 characters.
  .refine((v) => !v.credential?.password || v.credential.password.length >= 8, {
    message: 'Password must be at least 8 characters',
    path: ['credential', 'password'],
  })
  // Each director row, once started, must be complete: a designation, a valid
  // email and a full 10-digit contact number.
  .superRefine((v, ctx) => {
    const isName = (s?: string) => /^[\p{L}][\p{L} '-]*$/u.test((s ?? '').trim());
    (v.directors ?? []).forEach((d, i) => {
      const started = !!(
        d.firstName?.trim() ||
        d.middleName?.trim() ||
        d.lastName?.trim() ||
        d.email?.trim() ||
        d.contactNumber?.trim()
      );
      if (!started) return;
      if (!d.firstName?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'First name is required', path: ['directors', i, 'firstName'] });
      } else if (!isName(d.firstName)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use letters only', path: ['directors', i, 'firstName'] });
      }
      if (d.middleName?.trim() && !isName(d.middleName)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use letters only', path: ['directors', i, 'middleName'] });
      }
      if (!d.lastName?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Last name is required', path: ['directors', i, 'lastName'] });
      } else if (!isName(d.lastName)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use letters only', path: ['directors', i, 'lastName'] });
      }
      if (!d.email?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Email is required', path: ['directors', i, 'email'] });
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid email', path: ['directors', i, 'email'] });
      }
      if (!d.contactNumber?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Contact number is required', path: ['directors', i, 'contactNumber'] });
      } else if (!phoneComplete(d.contactNumber)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Phone number must be 10 digits', path: ['directors', i, 'contactNumber'] });
      }
    });
  })
  // Required identifiers for the selected registration country, plus the ABN
  // checksum for Australia.
  .superRefine((v, ctx) => {
    for (const field of companyFieldsFor(v.registrationCountry)) {
      const value = v.companyIdentifiers?.[field.key]?.trim() ?? '';
      if (field.required && !value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field.label} is required`,
          path: ['companyIdentifiers', field.key],
        });
      } else if (field.key === 'abn' && value && !isValidAbn(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'That ABN fails its check digits',
          path: ['companyIdentifiers', field.key],
        });
      }
    }
  });

type FormValues = z.input<typeof schema>;

const EMPTY_ADDRESS = { line1: '', line2: '', city: '', suburb: '', state: '', postcode: '', country: DEFAULT_COUNTRY };

const DEFAULTS: FormValues = {
  registrationCountry: DEFAULT_COUNTRY,
  companyIdentifiers: {},
  companyName: '',
  tradingNames: [{ value: '' }],
  businessType: '',
  principalAddress: { ...EMPTY_ADDRESS },
  billingAddress: { ...EMPTY_ADDRESS },
  sameAsPrincipal: true,
  contactPerson: '',
  contactEmail: '',
  contactMobile: '',
  contactMobileCountry: DEFAULT_COUNTRY,
  contactPosition: '',
  authorized: 'no',
  authorizedPerson: '',
  authorizedEmail: '',
  authorizedMobile: '',
  authorizedMobileCountry: DEFAULT_COUNTRY,
  invoiceCustomer: '',
  billingContactPerson: '',
  billingContactNumber: '',
  billingContactNumberCountry: DEFAULT_COUNTRY,
  billingEmail: '',
  creditScore: '',
  invoiceTerm: '',
  invoiceTermCustom: '',
  paymentMethod: '',
  accountStatus: 'ACTIVE',
  credential: { email: '', password: '' },
  sameAsContactInfo: false,
  directors: [
    { firstName: '', middleName: '', lastName: '', email: '', contactNumber: '', contactNumberCountry: DEFAULT_COUNTRY },
  ],
  assignedProducts: [],
};

const EMPTY_DIRECTOR = {
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  contactNumber: '',
  contactNumberCountry: DEFAULT_COUNTRY,
};

// ── Layout helpers ─────────────────────────────────────────

/** Filled-grey styling for the composite controls (phone, country picker,
    address autocomplete) so they match the plain inputs around them. */
const FILLED_CONTROL = 'border-slate-200 bg-slate-50 shadow-none';

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Building2;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3 space-y-0 rounded-t-2xl border-b border-border/60 bg-secondary/30">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </CardHeader>
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  );
}

/**
 * A form field: a small label above a standard-height control. Every control is
 * `h-10`, so a grid row of fields lines up perfectly. (The unused `plain` prop
 * is accepted so existing call sites keep compiling.)
 */
function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  plain?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * IT Details — placeholder section requested to sit after Invoicing Details.
 *
 * NOTE: these fields are UI-only for now and are held in local state, so nothing
 * here is sent to the API or persisted. Once the final field list is agreed,
 * wire them into the form schema, the backend validator/service and a migration.
 */
const EMPTY_IT_DETAILS = {
  domainName: '',
  websiteUrl: '',
  hostingProvider: '',
  serverIp: '',
  emailPlatform: '',
  userSeats: '',
  antivirus: '',
  backupSolution: '',
  notes: '',
};

function ITDetailsSection({ disabled }: { disabled?: boolean }) {
  const [it, setIt] = useState(EMPTY_IT_DETAILS);
  const set = (key: keyof typeof EMPTY_IT_DETAILS) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setIt((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <Section
      icon={Server}
      title="IT Details"
      description="Technical account details — placeholder fields for now, not yet saved"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Domain Name" hint="e.g. acme.com.au">
          <Input disabled={disabled} value={it.domainName} onChange={set('domainName')} />
        </Field>
        <Field label="Website URL">
          <Input disabled={disabled} placeholder="https://" value={it.websiteUrl} onChange={set('websiteUrl')} />
        </Field>
        <Field label="Hosting Provider" hint="e.g. Azure, AWS, cPanel host">
          <Input disabled={disabled} value={it.hostingProvider} onChange={set('hostingProvider')} />
        </Field>
        <Field label="Server / IP Address">
          <Input disabled={disabled} value={it.serverIp} onChange={set('serverIp')} />
        </Field>
        <Field label="Email Platform" hint="e.g. Microsoft 365, Google Workspace">
          <Input disabled={disabled} value={it.emailPlatform} onChange={set('emailPlatform')} />
        </Field>
        <Field label="Number of Users / Seats">
          <Input disabled={disabled} inputMode="numeric" value={it.userSeats} onChange={set('userSeats')} />
        </Field>
        <Field label="Antivirus / Endpoint Protection">
          <Input disabled={disabled} value={it.antivirus} onChange={set('antivirus')} />
        </Field>
        <Field label="Backup Solution">
          <Input disabled={disabled} value={it.backupSolution} onChange={set('backupSolution')} />
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="IT Notes" hint="Anything else worth recording about this customer's IT setup">
            <textarea
              disabled={disabled}
              value={it.notes}
              onChange={set('notes')}
              rows={3}
              className="flex min-h-20 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </Field>
        </div>
      </div>
    </Section>
  );
}

/**
 * Customer Credential — the portal login the admin provisions for the customer.
 *
 * On create, both fields set up the login. On edit, the email prefills and the
 * password box sets a NEW password (blank keeps the current one); the admin can
 * also reveal the password currently in force.
 */
function CredentialSection({
  register,
  passwordError,
  isEdit,
  clientId,
  hasCredential,
}: {
  register: ReturnType<typeof useForm<FormValues>>['register'];
  passwordError?: string;
  isEdit: boolean;
  clientId?: string;
  hasCredential?: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  const reveal = async () => {
    if (!clientId) return;
    setRevealing(true);
    try {
      const res = await customerApi.revealCredential(clientId);
      if (res.available && res.password) {
        setRevealed(res.password);
      } else {
        toast.info('No stored password to reveal — set a new one below to reset it');
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not reveal the password'));
    } finally {
      setRevealing(false);
    }
  };

  return (
    <Section
      icon={KeyRound}
      title="Customer Credential"
      description="The email and password the customer uses to sign in to their portal"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Customer Email (User ID)"
          hint="The email the customer logs in with"
        >
          <Input type="email" autoComplete="off" {...register('credential.email')} />
        </Field>
        <Field
          label={isEdit ? 'New Password' : 'Password'}
          error={passwordError}
          hint={isEdit ? 'Leave blank to keep the current password' : 'At least 8 characters'}
        >
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              className="pr-10"
              {...register('credential.password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
      </div>

      {isEdit && hasCredential && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={reveal} disabled={revealing}>
            {revealing ? <Spinner /> : <Eye className="h-3.5 w-3.5" />}
            Reveal current password
          </Button>
          {revealed && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-1.5">
              <code className="text-sm">{revealed}</code>
              <button
                type="button"
                aria-label="Copy password"
                onClick={() => {
                  navigator.clipboard?.writeText(revealed);
                  toast.success('Password copied');
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {!isEdit && (
        <p className="mt-3 text-xs text-muted-foreground">
          The customer can sign in immediately with these details and change their own password later
          — any change stays visible to you here.
        </p>
      )}
    </Section>
  );
}

/** Slim progress card mirroring the reference — a filled track with milestone
    dots that light up as the operator completes the form. */
function FormProgress({ percent }: { percent: number }) {
  const steps = [20, 40, 60, 80, 100];
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <p className="text-xs font-medium text-muted-foreground">Your progress</p>
      <p className="text-sm font-semibold text-primary">{percent}% to complete</p>
      <div className="relative mt-3 h-1.5 rounded-full bg-slate-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
        {steps.map((s) => (
          <span
            key={s}
            className={cn(
              'absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-500',
              percent >= s ? 'bg-primary' : 'bg-slate-300'
            )}
            style={{ left: `${s}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Metres for a rough fix, kilometres once it stops being a street-level number. */
function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;
}

/**
 * Street address field with live autocomplete.
 *
 * Once three characters are typed it asks the API for matching addresses in the
 * currently selected country, debounced so a burst of keystrokes makes one call.
 * Picking a suggestion fills line1, line2, city, postcode and — when the match
 * lands in another country — the country picker too. Everything stays editable;
 * the suggestion is a shortcut, and free typing always wins if none fits.
 */
function AddressAutocomplete({
  prefix,
  register,
  control,
  setValue,
  disabled,
}: {
  prefix: 'principalAddress' | 'billingAddress';
  register: ReturnType<typeof useForm<FormValues>>['register'];
  control: Control<FormValues>;
  setValue: ReturnType<typeof useForm<FormValues>>['setValue'];
  disabled?: boolean;
}) {
  // The selected country scopes the search so suggestions stay relevant.
  const country = useWatch({ control, name: `${prefix}.country` });
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Bumped on every keystroke so a slow response for an old term is ignored.
  const reqId = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const line1 = titleCaseField(register(`${prefix}.line1` as const));

  // Debounce: only fire once typing settles. Suggestions start from the first
  // character typed.
  useEffect(() => {
    if (disabled) return;
    const q = term.trim();
    if (q.length < 1) {
      // Nothing to search — abandon any in-flight response and stop the spinner.
      reqId.current++;
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await geoApi.search(q, country || undefined);
        // Drop the answer if a newer keystroke has already superseded it.
        if (id !== reqId.current) return;
        setSuggestions(results);
        setOpen(true);
      } catch {
        // A failed lookup should never block manual entry — just show nothing.
        if (id === reqId.current) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [term, country, disabled]);

  // Close the list when focus moves elsewhere on the page.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const choose = (s: AddressSuggestion) => {
    setValue(`${prefix}.line1`, toTitleCase(s.line1 || s.label), { shouldDirty: true });
    setValue(`${prefix}.line2`, toTitleCase(s.line2), { shouldDirty: true });
    if (s.city) setValue(`${prefix}.city`, toTitleCase(s.city), { shouldDirty: true });
    if (s.postcode) setValue(`${prefix}.postcode`, s.postcode, { shouldDirty: true });
    if (countryByCode(s.countryCode)) {
      setValue(`${prefix}.country`, s.countryCode, { shouldDirty: true });
    }
    setTerm('');
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <Input
        placeholder="Start typing an address…"
        autoComplete="off"
        disabled={disabled}
        className={FILLED_CONTROL}
        {...line1}
        onChange={(e) => {
          line1.onChange(e);
          setTerm(e.target.value);
        }}
        onFocus={() => {
          if (suggestions.length) setOpen(true);
        }}
        onBlur={(e) => {
          line1.onBlur(e);
          // Leaving the field: ignore any in-flight response and drop the spinner.
          // A suggestion click uses onMouseDown/preventDefault, so it still lands.
          reqId.current++;
          setLoading(false);
          setOpen(false);
        }}
      />
      {loading && (
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Spinner />
        </div>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover py-1 shadow-md">
          {suggestions.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <button
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                // Blur fires before click otherwise, closing the list first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="leading-snug">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Address block reused by the Principal and Billing addresses.
 *
 * "Use my location" asks the browser for coordinates (with the operator's
 * permission) and prefills the fields from a reverse-geocode lookup. Every
 * field stays freely editable — the lookup is a shortcut, never a lock-in.
 */
function AddressFields({
  prefix,
  register,
  control,
  setValue,
  disabled,
}: {
  prefix: 'principalAddress' | 'billingAddress';
  register: ReturnType<typeof useForm<FormValues>>['register'];
  control: Control<FormValues>;
  setValue: ReturnType<typeof useForm<FormValues>>['setValue'];
  disabled?: boolean;
}) {
  const [locating, setLocating] = useState(false);
  // Drives the State dropdown — its options follow whichever country is chosen.
  const addressCountry = useWatch({ control, name: `${prefix}.country` });

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      toast.error('This browser cannot detect your location — enter the address manually');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const found = await geoApi.reverse(pos.coords.latitude, pos.coords.longitude);
          // Only overwrite what the lookup actually resolved, so a partial
          // result never wipes something already typed.
          if (found.line1) setValue(`${prefix}.line1`, toTitleCase(found.line1), { shouldDirty: true });
          if (found.city) setValue(`${prefix}.city`, toTitleCase(found.city), { shouldDirty: true });
          if (found.postcode) setValue(`${prefix}.postcode`, found.postcode, { shouldDirty: true });
          if (countryByCode(found.countryCode)) {
            setValue(`${prefix}.country`, found.countryCode, { shouldDirty: true });
          }

          // A postcode is only as good as the fix behind it. Browsers fall back
          // to WiFi or IP when GPS is unavailable, which can be off by
          // kilometres — and a wrong postcode looks just as confident as a right
          // one, so say when the fix was too loose to trust.
          const accuracy = Math.round(pos.coords.accuracy);
          if (found.precision === 'approximate') {
            toast.warning(
              'Only the area could be identified — enter the street and postcode yourself'
            );
          } else if (accuracy > 500) {
            toast.warning(
              `Your location is only accurate to about ${formatDistance(accuracy)} — check the postcode`
            );
          } else if (!found.line1) {
            toast.warning('No street is mapped here — enter the street address yourself');
          } else {
            toast.success('Address filled from your location — check and adjust as needed');
          }
        } catch (err) {
          toast.error(apiErrorMessage(err, 'Could not look up that location'));
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied — enter the address manually'
            : 'Could not get your location — enter the address manually'
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex justify-end sm:col-span-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || locating}
          onClick={useMyLocation}
        >
          {locating ? <Spinner /> : <MapPin className="h-3.5 w-3.5" />}
          {locating ? 'Detecting…' : 'Use my location'}
        </Button>
      </div>
      <div className="sm:col-span-2">
        <Field
          label="Street Address"
          plain
          hint="Type a few letters and pick your address to fill the fields below"
        >
          <AddressAutocomplete
            prefix={prefix}
            register={register}
            control={control}
            setValue={setValue}
            disabled={disabled}
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Address Line 2">
          <Input
            placeholder="Optional"
            disabled={disabled}
            {...titleCaseField(register(`${prefix}.line2` as const))}
          />
        </Field>
      </div>
      <Field label="Suburb">
        <Input disabled={disabled} {...titleCaseField(register(`${prefix}.suburb` as const))} />
      </Field>
      <Field label="City">
        <Input disabled={disabled} {...titleCaseField(register(`${prefix}.city` as const))} />
      </Field>
      <Field label="State">
        <Controller
          control={control}
          name={`${prefix}.state` as const}
          render={({ field }) => (
            <StateSelect
              countryCode={addressCountry ?? DEFAULT_COUNTRY}
              value={field.value ?? ''}
              onChange={field.onChange}
              disabled={disabled}
              className={FILLED_CONTROL}
            />
          )}
        />
      </Field>
      <Field label="Postcode">
        <Input maxLength={10} disabled={disabled} {...register(`${prefix}.postcode` as const)} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Country" plain>
          <Controller
            control={control}
            name={`${prefix}.country` as const}
            render={({ field }) => (
              <CountrySelect
                disabled={disabled}
                className={FILLED_CONTROL}
                value={field.value ?? DEFAULT_COUNTRY}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
      </div>
    </div>
  );
}

/** Phone control wired to react-hook-form (country + number are two fields). */
function PhoneField({
  control,
  numberName,
  countryName,
  disabled,
}: {
  control: Control<FormValues>;
  numberName: 'contactMobile' | 'authorizedMobile' | 'billingContactNumber';
  countryName:
    | 'contactMobileCountry'
    | 'authorizedMobileCountry'
    | 'billingContactNumberCountry';
  disabled?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={numberName}
      render={({ field: numField }) => (
        <Controller
          control={control}
          name={countryName}
          render={({ field: cField }) => (
            <PhoneInput
              disabled={disabled}
              className={FILLED_CONTROL}
              country={cField.value ?? DEFAULT_COUNTRY}
              onCountryChange={cField.onChange}
              value={numField.value ?? ''}
              onValueChange={numField.onChange}
              onBlur={numField.onBlur}
            />
          )}
        />
      )}
    />
  );
}

// ── Page ───────────────────────────────────────────────────

export default function CustomerFormPage() {
  const { clientId } = useParams();
  const isEdit = !!clientId;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: products } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productApi.list({ pageSize: 100, status: 'ACTIVE' }),
  });
  const { data: existing } = useQuery({
    queryKey: ['customer', clientId],
    queryFn: () => customerApi.get(clientId!),
    enabled: isEdit,
  });
  // On the Add form, preview the Client ID this customer will be assigned so the
  // field shows the real value instead of a generic "Auto-generated" placeholder.
  const { data: nextClientId } = useQuery({
    queryKey: ['customers', 'next-client-id'],
    queryFn: () => customerApi.nextClientId(),
    enabled: !isEdit,
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    getValues,
    formState: { errors, dirtyFields },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  const { fields, append, remove } = useFieldArray({ control, name: 'assignedProducts' });
  const {
    fields: tradingNameFields,
    append: appendTradingName,
    remove: removeTradingName,
    replace: replaceTradingNames,
  } = useFieldArray({ control, name: 'tradingNames' });
  const {
    fields: directorFields,
    append: appendDirector,
    remove: removeDirector,
  } = useFieldArray({ control, name: 'directors' });
  const sameAsPrincipal = watch('sameAsPrincipal');
  const authorized = watch('authorized');
  const assigned = watch('assignedProducts');
  const invoiceTerm = watch('invoiceTerm');

  const registrationCountry = watch('registrationCountry');
  const companyFields = companyFieldsFor(registrationCountry);
  const abn = watch('companyIdentifiers.abn');

  const [abnLooking, setAbnLooking] = useState(false);
  const [abnResult, setAbnResult] = useState<AbnLookupResult | null>(null);
  const [addrFetching, setAddrFetching] = useState(false);

  /**
   * Fill the Principal Address from CreditorWatch via the customer's ABN.
   */
  const fillPrincipalFromCreditorWatch = async () => {
    const digits = (abn ?? '').replace(/\D/g, '');
    if (!isValidAbn(digits)) {
      toast.error(
        digits.length === 11
          ? 'That ABN fails its check digits — retype it and try again'
          : 'Enter all 11 digits of the ABN first'
      );
      return;
    }

    setAddrFetching(true);
    try {
      // NOTE: Using the existing abnApi backend endpoint as a proxy/placeholder
      // for CreditorWatch data since direct frontend fetches to app.creditorwatch.com.au
      // would be blocked by CORS without proper server-to-server API key integration.
      const found = await abnApi.lookup(digits);
      const set = (name: Parameters<typeof setValue>[0], value: string) =>
        setValue(name, value, { shouldDirty: true });

      set('principalAddress.country', 'AU');
      if (found.postcode) set('principalAddress.postcode', found.postcode);

      let city = '';
      if (found.postcode) {
        try {
          const query = [found.postcode, found.state, 'Australia'].filter(Boolean).join(' ');
          const [hit] = await geoApi.search(query, 'AU');
          if (hit?.city) {
            city = hit.city;
            set('principalAddress.city', hit.city);
          }
        } catch {
        }
      }

      if (!found.postcode) {
        toast.warning('CreditorWatch returned no address for this ABN — enter it manually');
      } else {
        toast.success(
          `Address filled from CreditorWatch (${[city, found.state, found.postcode]
            .filter(Boolean)
            .join(' ')}) — add the street line manually`
        );
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not fetch the address from CreditorWatch'));
    } finally {
      setAddrFetching(false);
    }
  };

  /**
   * Fill Company Information from the Australian Business Register.
   *
   * Only fields the register actually resolved are written, so a sparse record
   * never wipes something already typed. The register publishes no street or
   * suburb — just the postcode and state of the main business address — so the
   * remaining address fields are left for the operator. Everything stays
   * editable afterwards; the lookup is a shortcut, not a lock-in.
   */
  const lookupAbn = async () => {
    const digits = (abn ?? '').replace(/\D/g, '');
    if (!isValidAbn(digits)) {
      toast.error(
        digits.length === 11
          ? 'That ABN fails its check digits — retype it and try again'
          : 'Enter all 11 digits of the ABN first'
      );
      return;
    }

    setAbnLooking(true);
    try {
      const found = await abnApi.lookup(digits);
      setAbnResult(found);

      const set = (name: Parameters<typeof setValue>[0], value: string) =>
        setValue(name, value, { shouldDirty: true, shouldValidate: true });

      // Normalise to the register's own record of the ABN.
      if (found.abn) set('companyIdentifiers.abn', formatAbn(found.abn));
      if (found.acn) set('companyIdentifiers.acn', found.acn);
      if (found.entityName) set('companyName', found.entityName);
      // A company can hold dozens of registered names on the ABR. Take them all —
      // each gets its own row so the operator can see and prune the list.
      if (found.businessNames.length) {
        replaceTradingNames(found.businessNames.map((value) => ({ value })));
      }
      if (found.postcode) set('principalAddress.postcode', found.postcode);
      // The ABR only covers Australian entities, so the country is a given.
      set('principalAddress.country', 'AU');

      if (found.abnStatus && found.abnStatus.toLowerCase() !== 'active') {
        toast.warning(`This ABN is ${found.abnStatus.toLowerCase()} on the register`);
      } else {
        toast.success('Company details filled from the Business Register');
      }
    } catch (err) {
      setAbnResult(null);
      toast.error(apiErrorMessage(err, 'Could not look that ABN up'));
    } finally {
      setAbnLooking(false);
    }
  };


  // Watch the address leaves individually. `watch('principalAddress')` hands
  // back a reference that react-hook-form mutates in place, so its identity
  // never changes and an effect keyed on it would never re-run.
  const [pLine1, pLine2, pCity, pSuburb, pState, pPostcode, pCountry] = watch([
    'principalAddress.line1',
    'principalAddress.line2',
    'principalAddress.city',
    'principalAddress.suburb',
    'principalAddress.state',
    'principalAddress.postcode',
    'principalAddress.country',
  ]);

  // Mirror the principal address into billing while the box is ticked. Each key
  // is set individually — setting the parent object alone does not notify the
  // Controller subscribed to `billingAddress.country`, so the country picker
  // would keep showing a stale flag.
  const companyName = watch('companyName');
  const prevCompany = useRef(companyName);
  const sameAsContactInfo = watch('sameAsContactInfo');
  
  useEffect(() => {
    if (!dirtyFields.invoiceCustomer) {
      const currentInvoiceCust = getValues('invoiceCustomer');
      if (!currentInvoiceCust || currentInvoiceCust === prevCompany.current) {
        setValue('invoiceCustomer', companyName ?? '');
      }
    }
    prevCompany.current = companyName;
  }, [companyName, dirtyFields.invoiceCustomer, setValue, getValues]);

  const [cPerson, cEmail, cMobile, cMobileCountry] = watch([
    'contactPerson',
    'contactEmail',
    'contactMobile',
    'contactMobileCountry',
  ]);

  useEffect(() => {
    if (!sameAsContactInfo) return;
    const parts = (cPerson ?? '').split(' ');
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ');
    
    setValue('directors.0.firstName', firstName, { shouldValidate: true });
    setValue('directors.0.middleName', '');
    setValue('directors.0.lastName', lastName, { shouldValidate: true });
    setValue('directors.0.email', cEmail ?? '', { shouldValidate: true });
    setValue('directors.0.contactNumber', cMobile ?? '', { shouldValidate: true });
    setValue('directors.0.contactNumberCountry', cMobileCountry ?? DEFAULT_COUNTRY, { shouldValidate: true });
  }, [sameAsContactInfo, cPerson, cEmail, cMobile, cMobileCountry, setValue]);

  useEffect(() => {
    if (!sameAsPrincipal) return;
    setValue('billingAddress.line1', pLine1 ?? '');
    setValue('billingAddress.line2', pLine2 ?? '');
    setValue('billingAddress.city', pCity ?? '');
    setValue('billingAddress.suburb', pSuburb ?? '');
    setValue('billingAddress.state', pState ?? '');
    setValue('billingAddress.postcode', pPostcode ?? '');
    setValue('billingAddress.country', pCountry ?? DEFAULT_COUNTRY);
  }, [sameAsPrincipal, pLine1, pLine2, pCity, pSuburb, pState, pPostcode, pCountry, setValue]);

  useEffect(() => {
    if (!existing) return;
    const principal = existing.addresses?.find((a) => a.type === 'PRINCIPAL');
    const billing = existing.addresses?.find((a) => a.type === 'BILLING');
    const addr = (a?: Address) => ({
      line1: a?.line1 ?? '',
      line2: a?.line2 ?? '',
      city: a?.city ?? '',
      suburb: a?.suburb ?? '',
      state: a?.state ?? '',
      postcode: a?.postcode ?? '',
      country: countryCodeByName(a?.country),
    });
    reset({
      ...DEFAULTS,
      registrationCountry: existing.registrationCountry ?? DEFAULT_COUNTRY,
      // Prefer the stored identifier map; fall back to the legacy ABN/ACN columns.
      companyIdentifiers:
        existing.companyIdentifiers ??
        (existing.abn || existing.acn
          ? { abn: existing.abn ?? '', acn: existing.acn ?? '' }
          : {}),
      companyName: existing.companyName ?? '',
      // Records saved before trading names were a list still carry only the
      // single tradingAs column — fall back to it so nothing looks empty.
      tradingNames: (existing.tradingNames?.length
        ? existing.tradingNames
        : [existing.tradingAs ?? '']
      ).map((value) => ({ value })),
      businessType: existing.businessType ?? '',
      principalAddress: addr(principal),
      billingAddress: addr(billing),
      // Never re-tick "same as principal" on load — that would silently
      // overwrite a billing address the operator deliberately made different.
      sameAsPrincipal: false,
      contactPerson: existing.contactPerson ?? '',
      contactEmail: existing.contactEmail ?? '',
      contactMobile: existing.contactMobile ?? '',
      contactMobileCountry: existing.contactMobileCountry ?? DEFAULT_COUNTRY,
      contactPosition: existing.contactPosition ?? '',
      authorized: existing.authorized ? 'yes' : 'no',
      authorizedPerson: existing.authorizedPerson ?? '',
      authorizedEmail: existing.authorizedEmail ?? '',
      authorizedMobile: existing.authorizedMobile ?? '',
      authorizedMobileCountry: existing.authorizedMobileCountry ?? DEFAULT_COUNTRY,
      invoiceCustomer: existing.invoiceCustomer ?? '',
      billingContactPerson: existing.billingContactPerson ?? '',
      billingContactNumber: existing.billingContactNumber ?? '',
      billingContactNumberCountry: existing.billingContactNumberCountry ?? DEFAULT_COUNTRY,
      billingEmail: existing.billingEmail ?? '',
      // Prefill the login email; the password is never loaded — the admin reveals
      // it on demand and can type a new one to reset it.
      credential: { email: existing.credentialEmail ?? '', password: '' },
      creditScore: existing.creditScore != null ? String(existing.creditScore) : '',
      // A stored term is either a preset code or free text. Free text loads the
      // dropdown as "Enter manually" with the text in the custom field.
      invoiceTerm: !existing.invoiceTerm
        ? ''
        : INVOICE_TERMS.some((t) => t.value === existing.invoiceTerm)
          ? existing.invoiceTerm
          : 'MANUAL',
      invoiceTermCustom:
        existing.invoiceTerm && !INVOICE_TERMS.some((t) => t.value === existing.invoiceTerm)
          ? existing.invoiceTerm
          : '',
      paymentMethod: existing.paymentMethod ?? '',
      accountStatus: existing.accountStatus ?? 'ACTIVE',
      directors: existing.directors?.length
        ? existing.directors.map((d) => ({
            firstName: d.firstName ?? '',
            middleName: d.middleName ?? '',
            lastName: d.lastName ?? '',
            email: d.email ?? '',
            contactNumber: d.contactNumber ?? '',
            contactNumberCountry: d.contactNumberCountry ?? DEFAULT_COUNTRY,
          }))
        : [{ ...EMPTY_DIRECTOR }],
      assignedProducts: [],
    });
  }, [existing, reset]);

  const productMap = useMemo(
    () => new Map((products?.items ?? []).map((p) => [p.id, p])),
    [products]
  );

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      // Addresses persist the country's display name; the picker works in ISO
      // codes, so translate on the way out.
      const withCountryName = (a?: FormValues['principalAddress']) =>
        a ? { ...a, country: countryName(a.country) || DEFAULT_COUNTRY_NAME } : a;

      const payload = {
        ...values,
        // Client ID is generated server-side and never sent from here.
        authorized: values.authorized === 'yes',
        creditScore: values.creditScore?.trim() ? Number(values.creditScore) : undefined,
        // Resolve the manual term to its typed text; drop the helper field.
        invoiceTerm:
          values.invoiceTerm === 'MANUAL'
            ? values.invoiceTermCustom?.trim() || undefined
            : values.invoiceTerm || undefined,
        invoiceTermCustom: undefined,
        // Only send the selected country's identifiers, dropping blanks — this
        // discards any values left over from a previously chosen country.
        companyIdentifiers: Object.fromEntries(
          companyFieldsFor(values.registrationCountry)
            .map((f) => [f.key, values.companyIdentifiers?.[f.key]?.trim() ?? ''] as const)
            .filter(([, val]) => val)
        ),
        // The API stores a plain string list and mirrors the first into tradingAs.
        tradingNames: (values.tradingNames ?? [])
          .map((n) => n.value.trim())
          .filter(Boolean),
        principalAddress: withCountryName(values.principalAddress),
        billingAddress: withCountryName(values.billingAddress),
        // Drop blank director rows; a row counts once it has an email.
        directors: (values.directors ?? [])
          .filter((d) => d.email?.trim())
          .map((d) => ({
            firstName: d.firstName?.trim() || undefined,
            middleName: d.middleName?.trim() || undefined,
            lastName: d.lastName?.trim() || undefined,
            email: d.email!.trim(),
            contactNumber: d.contactNumber?.trim() || undefined,
            contactNumberCountry: d.contactNumberCountry,
          })),
        assignedProducts: isEdit ? undefined : values.assignedProducts,
        // Send the login only when the admin actually set/changed something.
        credential:
          values.credential?.email?.trim() || values.credential?.password?.trim()
            ? {
                email: values.credential.email?.trim() || undefined,
                password: values.credential.password?.trim() || undefined,
              }
            : undefined,
      };
      return isEdit ? customerApi.update(clientId!, payload) : customerApi.create(payload);
    },
    onSuccess: (customer) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer', clientId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(isEdit ? 'Customer updated' : 'Customer created');
      navigate(`/admin/customers/${customer.clientId ?? clientId}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  // ── Completion meter ──
  // A light "how full is this record" gauge driven by the fields most worth
  // filling. It never blocks submit — it's a nudge, not a gate.
  const all = watch();
  const identifiersFilled = Object.values(all.companyIdentifiers ?? {}).some((v) => !!v?.trim());
  const progressChecks = [
    !!all.companyName?.trim(),
    identifiersFilled,
    !!all.businessType?.trim(),
    !!all.principalAddress?.line1?.trim(),
    !!all.principalAddress?.city?.trim(),
    !!all.principalAddress?.postcode?.trim(),
    !!all.contactPerson?.trim(),
    !!all.contactEmail?.trim(),
    !!all.contactMobile?.trim(),
    (all.directors ?? []).some((d) => d.email?.trim()),
    !!all.billingContactPerson?.trim() || !!all.billingEmail?.trim(),
    !!all.invoiceTerm?.trim(),
    !!all.paymentMethod?.trim(),
  ];
  const progress = Math.round(
    (progressChecks.filter(Boolean).length / progressChecks.length) * 100
  );

  return (
    <div className="w-full space-y-6">
      {/* ── Page header + completion meter ── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-secondary/30 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/admin/customers">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {isEdit ? 'Edit Customer' : 'Add Customer'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isEdit ? (existing?.clientId ?? ' ') : 'Create a new client record'}
              </p>
            </div>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
            <Pencil className="h-4 w-4" />
          </span>
        </div>
        <div className="p-4 sm:p-5">
          <FormProgress percent={progress} />
        </div>
      </div>

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="ff-form space-y-6">
        {/* ── 1. Company Information ── */}
        <Section icon={Building2} title="Company Information">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Ask for the registration country first — the identifiers below are
                whatever that country issues (ABN/ACN for AU, CRN/VAT for GB, …). */}
            <Field
              label="Registration Country"
              plain
              hint="The company identifiers below depend on this"
            >
              <Controller
                control={control}
                name="registrationCountry"
                render={({ field }) => (
                  <CountrySelect
                    className={FILLED_CONTROL}
                    value={field.value ?? DEFAULT_COUNTRY}
                    onChange={field.onChange}
                  />
                )}
              />
            </Field>
            {companyFields.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                plain
                hint={f.hint}
                error={errors.companyIdentifiers?.[f.key]?.message}
              >
                {f.lookup ? (
                  <div className="flex gap-2">
                    <Input
                      maxLength={f.maxLength ? f.maxLength + 3 : undefined}
                      placeholder="51 824 753 556"
                      className={cn('flex-1', FILLED_CONTROL)}
                      {...guardedField(register(`companyIdentifiers.${f.key}` as const), 'abn')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={abnLooking}
                      onClick={lookupAbn}
                      className="shrink-0"
                    >
                      {abnLooking ? <Spinner /> : <Search className="h-3.5 w-3.5" />}
                      {abnLooking ? 'Looking up…' : 'ABN Lookup'}
                    </Button>
                  </div>
                ) : (
                  <Input
                    maxLength={f.maxLength}
                    className={FILLED_CONTROL}
                    {...guardedField(register(`companyIdentifiers.${f.key}` as const), f.kind)}
                  />
                )}
              </Field>
            ))}
            <Field label="Business Name">
              <Input {...register('companyName')} />
            </Field>
            {/*
              One row per trading name. An ABN lookup replaces the whole list
              with what the register holds, and each row stays removable — a
              business with 40 registered names should not force 40 into the
              record.
            */}
            <Field
              label="Trading As"
              plain
              hint={
                tradingNameFields.length > 1
                  ? `${tradingNameFields.length} trading names — the first is the primary`
                  : undefined
              }
            >
              <div className="space-y-2">
                {tradingNameFields.map((field, i) => (
                  <div key={field.id} className="flex gap-2">
                    <Input
                      className={cn('flex-1', FILLED_CONTROL)}
                      placeholder={i === 0 ? 'Primary trading name' : `Trading name ${i + 1}`}
                      {...register(`tradingNames.${i}.value` as const)}
                    />
                    {tradingNameFields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove trading name ${i + 1}`}
                        onClick={() => removeTradingName(i)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => appendTradingName({ value: '' })}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add trading name
                </Button>
              </div>
            </Field>
            <Field label="Business Type">
              <Select {...register('businessType')}>
                <option value="">Select business type…</option>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Client ID" hint="Generated automatically — unique per client">
              <Input
                readOnly
                disabled
                className="font-mono"
                value={isEdit ? (existing?.clientId ?? '') : (nextClientId ?? '')}
                placeholder="Auto-generated"
              />
            </Field>
          </div>

          {/*
            What the register returned that has no field on this form — entity
            type, ABN status, state, GST and any extra registered names. Shown
            so the operator can see the whole record they just pulled, and copy
            anything relevant into the notes.
          */}
          {abnResult && (
            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-sm font-medium">From the Business Register</p>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {[
                  ['ABN status', abnResult.abnStatus],
                  ['Entity type', abnResult.entityTypeName],
                  ['State', abnResult.state],
                  ['GST registered from', abnResult.gstFrom],
                ]
                  .filter(([, value]) => !!value)
                  .map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-right font-medium">{value}</dd>
                    </div>
                  ))}
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                The register publishes only the postcode and state of the main address — add the
                street and suburb below.
              </p>
            </div>
          )}

          <div className="mt-6 space-y-4 border-t border-border pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Principal Address</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={addrFetching}
                onClick={fillPrincipalFromCreditorWatch}
              >
                {addrFetching ? <Spinner /> : <Search className="h-3.5 w-3.5" />}
                {addrFetching ? 'Fetching…' : 'Fetch from CreditorWatch'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Fills postcode, suburb and country from CreditorWatch (via ABN) — add the street line yourself, or
              enter the whole address manually below.
            </p>
            <AddressFields
              prefix="principalAddress"
              register={register}
              control={control}
              setValue={setValue}
            />
          </div>

          <div className="mt-6 space-y-4 border-t border-border pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Billing Address</p>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  {...register('sameAsPrincipal')}
                />
                Same as principal address
              </label>
            </div>
            <AddressFields
              prefix="billingAddress"
              register={register}
              control={control}
              setValue={setValue}
              disabled={sameAsPrincipal}
            />
          </div>
        </Section>

        {/* ── 3. Contact Information ── */}
        <Section icon={Contact} title="Contact Information">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Contact Name">
              <Input {...guardedField(register('contactPerson'), 'letters')} />
            </Field>
            <Field label="Contact Email" error={errors.contactEmail?.message}>
              <Input type="email" {...guardedField(register('contactEmail'), 'email')} />
            </Field>
            <Field label="Contact Mobile" plain>
              <PhoneField
                control={control}
                numberName="contactMobile"
                countryName="contactMobileCountry"
              />
            </Field>
            <Field label="Contact Position">
              <Input placeholder="e.g. Operations Manager" {...register('contactPosition')} />
            </Field>
            <Field label="Authorised">
              <Select {...register('authorized')}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </Select>
            </Field>
          </div>

          {authorized === 'no' && (
            <div className="mt-6 space-y-4 border-t border-border pt-5">
              <p className="text-sm font-medium">Authorised Representative</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Authorised Person" error={errors.authorizedPerson?.message}>
                  <Input {...guardedField(register('authorizedPerson'), 'letters')} />
                </Field>
                <Field label="Authorised Email" error={errors.authorizedEmail?.message}>
                  <Input type="email" {...guardedField(register('authorizedEmail'), 'email')} />
                </Field>
                <Field label="Authorised Mobile" plain>
                  <PhoneField
                    control={control}
                    numberName="authorizedMobile"
                    countryName="authorizedMobileCountry"
                  />
                </Field>
              </div>
            </div>
          )}
        </Section>

        {/* ── Company C-Suite Details ── */}
        <Section
          icon={Users}
          title="Company C-Suite Details"
          description="Every director we may need to contact about this account."
        >
          <div className="space-y-4">
            <div className="flex items-center space-x-2 pb-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  {...register('sameAsContactInfo', {
                    onChange: (e) => {
                      if (!e.target.checked) {
                        setValue('directors.0.firstName', '', { shouldValidate: true });
                        setValue('directors.0.middleName', '', { shouldValidate: true });
                        setValue('directors.0.lastName', '', { shouldValidate: true });
                        setValue('directors.0.email', '', { shouldValidate: true });
                        setValue('directors.0.contactNumber', '', { shouldValidate: true });
                      }
                    }
                  })}
                />
                Same as Contact Info
              </label>
            </div>
            {directorFields.map((field, index) => (
              <div key={field.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium">Director {index + 1}</span>
                  {directorFields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeDirector(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field
                    label="First Name"
                    error={errors.directors?.[index]?.firstName?.message}
                  >
                    <Input
                      placeholder="First name"
                      {...guardedField(register(`directors.${index}.firstName` as const), 'letters')}
                    />
                  </Field>
                  <Field
                    label="Middle Name"
                    error={errors.directors?.[index]?.middleName?.message}
                  >
                    <Input
                      placeholder="Middle name (optional)"
                      {...guardedField(register(`directors.${index}.middleName` as const), 'letters')}
                    />
                  </Field>
                  <Field
                    label="Last Name"
                    error={errors.directors?.[index]?.lastName?.message}
                  >
                    <Input
                      placeholder="Last name"
                      {...guardedField(register(`directors.${index}.lastName` as const), 'letters')}
                    />
                  </Field>
                  <Field
                    label="Director Email Address"
                    error={errors.directors?.[index]?.email?.message}
                  >
                    <Input
                      type="email"
                      placeholder="director@example.com"
                      {...guardedField(register(`directors.${index}.email` as const), 'email')}
                    />
                  </Field>
                  <Field
                    label="Director Contact Number"
                    plain
                    error={errors.directors?.[index]?.contactNumber?.message}
                  >
                    <Controller
                      control={control}
                      name={`directors.${index}.contactNumber` as const}
                      render={({ field: numField }) => (
                        <Controller
                          control={control}
                          name={`directors.${index}.contactNumberCountry` as const}
                          render={({ field: cField }) => (
                            <PhoneInput
                              className={FILLED_CONTROL}
                              country={cField.value ?? DEFAULT_COUNTRY}
                              onCountryChange={cField.onChange}
                              value={numField.value ?? ''}
                              onValueChange={numField.onChange}
                              onBlur={numField.onBlur}
                            />
                          )}
                        />
                      )}
                    />
                  </Field>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => appendDirector({ ...EMPTY_DIRECTOR })}
            >
              <Plus className="h-4 w-4" /> Add More Director
            </Button>
          </div>
        </Section>

        {/* ── 4. Invoicing Details ── */}
        <Section
          icon={Receipt}
          title="Invoicing Details"
          description="Invoices and payment reminders are sent to the accounts contact"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Invoice Customer" hint="Name that appears on invoices">
              <Input {...register('invoiceCustomer')} />
            </Field>
            <Field label="Accounts Person Name">
              <Input {...guardedField(register('billingContactPerson'), 'letters')} />
            </Field>
            <Field label="Accounts Person Mobile" plain>
              <PhoneField
                control={control}
                numberName="billingContactNumber"
                countryName="billingContactNumberCountry"
              />
            </Field>
            <Field label="Accounts Person Email" error={errors.billingEmail?.message}>
              <Input type="email" {...guardedField(register('billingEmail'), 'email')} />
            </Field>
            <Field label="Credit Score" error={errors.creditScore?.message} hint="0 – 1200">
              <Input maxLength={4} placeholder="0 – 1200" {...numericField(register('creditScore'))} />
            </Field>
            <Field label="Invoice Term" hint="Default payment terms on this customer's invoices">
              <Select {...register('invoiceTerm')}>
                <option value="">Select invoice term…</option>
                {INVOICE_TERMS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
                <option value="MANUAL">Enter manually…</option>
              </Select>
            </Field>
            {invoiceTerm === 'MANUAL' && (
              <Field
                label="Invoice Term (manual)"
                error={errors.invoiceTermCustom?.message}
                hint="Type the term, e.g. Net 21 days or 50% upfront"
              >
                <Input
                  placeholder="e.g. Net 21 days"
                  maxLength={60}
                  {...register('invoiceTermCustom')}
                />
              </Field>
            )}
            <Field label="Payment Method" hint="Preferred way this customer pays">
              <Select {...register('paymentMethod')}>
                <option value="">Select payment method…</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Account Status"
              hint="Active auto-marks as Dormant after 6 months without an invoice; pin Dormant or Suspended to override"
            >
              <Select {...register('accountStatus')}>
                <option value="ACTIVE">Active</option>
                <option value="DORMANT">Dormant</option>
                <option value="SUSPENDED">Suspended</option>
              </Select>
            </Field>
          </div>
        </Section>

        {/* ── 4b. IT Details (UI-only placeholder — not yet persisted) ── */}
        <ITDetailsSection disabled={mutation.isPending} />

        {/* ── 5. Products ── */}
        {!isEdit && (
          <Section
            icon={Package}
            title="Products"
            description="Assign products and licences to this customer"
          >
            <div className="space-y-4">
              {fields.map((field, index) => {
                const selected = productMap.get(assigned?.[index]?.productId ?? '');
                return (
                  <div key={field.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-medium">Product {index + 1}</span>
                      <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="Product" error={errors.assignedProducts?.[index]?.productId?.message}>
                        <Controller
                          control={control}
                          name={`assignedProducts.${index}.productId`}
                          render={({ field: f }) => (
                            <Select
                              {...f}
                              onChange={(e) => {
                                f.onChange(e);
                                const p = productMap.get(e.target.value);
                                if (p) setValue(`assignedProducts.${index}.price`, Number(p.pricePerQty));
                              }}
                            >
                              <option value="">Select product…</option>
                              {products?.items.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} — {p.availableStock} available
                                </option>
                              ))}
                            </Select>
                          )}
                        />
                      </Field>
                      <Field
                        label="Quantity"
                        error={errors.assignedProducts?.[index]?.quantity?.message}
                      >
                        <Input {...numericField(register(`assignedProducts.${index}.quantity`))} />
                      </Field>
                      <Field label="Price">
                        <Input {...numericField(register(`assignedProducts.${index}.price`), 'decimal')} />
                      </Field>
                      <Field label="Licence Key">
                        <Input
                          placeholder="Auto-generated"
                          {...register(`assignedProducts.${index}.licence`)}
                        />
                      </Field>
                      <Field label="Issue Date">
                        <Input type="date" {...register(`assignedProducts.${index}.issueDate`)} />
                      </Field>
                      <Field label="Expiry Date">
                        <Input type="date" {...register(`assignedProducts.${index}.expiryDate`)} />
                      </Field>
                    </div>
                    {selected && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {selected.availableStock} in stock · {formatCurrency(selected.pricePerQty)} each
                      </p>
                    )}
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  append({ productId: '', quantity: 1, price: 0, licence: '', issueDate: '', expiryDate: '' })
                }
              >
                <Plus className="h-4 w-4" /> Add Product
              </Button>
            </div>
          </Section>
        )}

        {/* ── 6. Customer Credential ── */}
        <CredentialSection
          register={register}
          passwordError={errors.credential?.password?.message}
          isEdit={isEdit}
          clientId={clientId}
          hasCredential={existing?.hasCredential}
        />

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/admin/customers')}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner />} {isEdit ? 'Save changes' : 'Create customer'}
          </Button>
        </div>
      </form>
    </div>
  );
}
