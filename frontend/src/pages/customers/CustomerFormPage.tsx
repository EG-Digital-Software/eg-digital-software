import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray, Controller, type Control } from 'react-hook-form';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { customerApi, productApi, geoApi, abnApi } from '@/api/resources';
import type { AbnLookupResult } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { PageHeader } from '@/components/shared/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/shared/states';
import { PhoneInput, CountrySelect, phoneComplete } from '@/components/shared/PhoneInput';
import {
  DEFAULT_COUNTRY,
  DEFAULT_COUNTRY_NAME,
  countryByCode,
  countryCodeByName,
  countryName,
} from '@/lib/countries';
import { BUSINESS_TYPES, DIRECTOR_DESIGNATIONS, formatAbn, isValidAbn } from '@/lib/customer';
import { companyFieldsFor } from '@/lib/company';
import { numericField, guardedField } from '@/lib/input';
import { formatCurrency } from '@/lib/utils';
import type { Address } from '@/types';

// ── Validation ─────────────────────────────────────────────
// Mirrors backend/src/validators/customer.validator.ts so the operator sees the
// same rules the API enforces.

const addressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
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

    accountStatus: z.enum(['ACTIVE', 'DORMANT', 'SUSPENDED']).default('ACTIVE'),

    directors: z
      .array(
        z.object({
          designation: z.string().optional(),
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
  // Each director row, once started, must be complete: a designation, a valid
  // email and a full 10-digit contact number.
  .superRefine((v, ctx) => {
    (v.directors ?? []).forEach((d, i) => {
      const started = !!(d.designation?.trim() || d.email?.trim() || d.contactNumber?.trim());
      if (!started) return;
      if (!d.designation?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Designation is required', path: ['directors', i, 'designation'] });
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

const EMPTY_ADDRESS = { line1: '', line2: '', city: '', postcode: '', country: DEFAULT_COUNTRY };

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
  billingContactPerson: '',
  billingContactNumber: '',
  billingContactNumberCountry: DEFAULT_COUNTRY,
  billingEmail: '',
  creditScore: '',
  accountStatus: 'ACTIVE',
  directors: [{ designation: '', email: '', contactNumber: '', contactNumberCountry: DEFAULT_COUNTRY }],
  assignedProducts: [],
};

const EMPTY_DIRECTOR = {
  designation: '',
  email: '',
  contactNumber: '',
  contactNumberCountry: DEFAULT_COUNTRY,
};

// ── Layout helpers ─────────────────────────────────────────

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
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Metres for a rough fix, kilometres once it stops being a street-level number. */
function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;
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
          if (found.line1) setValue(`${prefix}.line1`, found.line1, { shouldDirty: true });
          if (found.city) setValue(`${prefix}.city`, found.city, { shouldDirty: true });
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
        <Field label="Street Address">
          <Input
            placeholder="Address line 1"
            disabled={disabled}
            {...register(`${prefix}.line1` as const)}
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Input
          placeholder="Address line 2 (optional)"
          disabled={disabled}
          {...register(`${prefix}.line2` as const)}
        />
      </div>
      <div className="sm:col-span-2">
        <Field label="Country">
          <Controller
            control={control}
            name={`${prefix}.country` as const}
            render={({ field }) => (
              <CountrySelect
                disabled={disabled}
                value={field.value ?? DEFAULT_COUNTRY}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
      </div>
      <Field label="City">
        <Input disabled={disabled} {...register(`${prefix}.city` as const)} />
      </Field>
      <Field label="Postcode">
        <Input maxLength={10} disabled={disabled} {...register(`${prefix}.postcode` as const)} />
      </Field>
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
    formState: { errors },
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

  const registrationCountry = watch('registrationCountry');
  const companyFields = companyFieldsFor(registrationCountry);
  const abn = watch('companyIdentifiers.abn');

  const [abnLooking, setAbnLooking] = useState(false);
  const [abnResult, setAbnResult] = useState<AbnLookupResult | null>(null);

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
  const [pLine1, pLine2, pCity, pPostcode, pCountry] = watch([
    'principalAddress.line1',
    'principalAddress.line2',
    'principalAddress.city',
    'principalAddress.postcode',
    'principalAddress.country',
  ]);

  // Mirror the principal address into billing while the box is ticked. Each key
  // is set individually — setting the parent object alone does not notify the
  // Controller subscribed to `billingAddress.country`, so the country picker
  // would keep showing a stale flag.
  useEffect(() => {
    if (!sameAsPrincipal) return;
    setValue('billingAddress.line1', pLine1 ?? '');
    setValue('billingAddress.line2', pLine2 ?? '');
    setValue('billingAddress.city', pCity ?? '');
    setValue('billingAddress.postcode', pPostcode ?? '');
    setValue('billingAddress.country', pCountry ?? DEFAULT_COUNTRY);
  }, [sameAsPrincipal, pLine1, pLine2, pCity, pPostcode, pCountry, setValue]);

  useEffect(() => {
    if (!existing) return;
    const principal = existing.addresses?.find((a) => a.type === 'PRINCIPAL');
    const billing = existing.addresses?.find((a) => a.type === 'BILLING');
    const addr = (a?: Address) => ({
      line1: a?.line1 ?? '',
      line2: a?.line2 ?? '',
      city: a?.city ?? '',
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
      billingContactPerson: existing.billingContactPerson ?? '',
      billingContactNumber: existing.billingContactNumber ?? '',
      billingContactNumberCountry: existing.billingContactNumberCountry ?? DEFAULT_COUNTRY,
      billingEmail: existing.billingEmail ?? '',
      creditScore: existing.creditScore != null ? String(existing.creditScore) : '',
      accountStatus: existing.accountStatus ?? 'ACTIVE',
      directors: existing.directors?.length
        ? existing.directors.map((d) => ({
            designation: d.designation ?? '',
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
            designation: d.designation?.trim() || undefined,
            email: d.email!.trim(),
            contactNumber: d.contactNumber?.trim() || undefined,
            contactNumberCountry: d.contactNumberCountry,
          })),
        assignedProducts: isEdit ? undefined : values.assignedProducts,
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/customers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title={isEdit ? 'Edit Customer' : 'Add Customer'}
          description={isEdit ? existing?.clientId : 'Create a new client record'}
        />
      </div>

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
        {/* ── 1. Company Information ── */}
        <Section icon={Building2} title="Company Information">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Ask for the registration country first — the identifiers below are
                whatever that country issues (ABN/ACN for AU, CRN/VAT for GB, …). */}
            <Field
              label="Registration Country"
              hint="The company identifiers below depend on this"
            >
              <Controller
                control={control}
                name="registrationCountry"
                render={({ field }) => (
                  <CountrySelect
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
                hint={f.hint}
                error={errors.companyIdentifiers?.[f.key]?.message}
              >
                {f.lookup ? (
                  <div className="flex gap-2">
                    <Input
                      maxLength={f.maxLength ? f.maxLength + 3 : undefined}
                      placeholder="51 824 753 556"
                      className="flex-1"
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
                      className="flex-1"
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
            <p className="text-sm font-medium">Principal Address</p>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Contact Name">
              <Input {...guardedField(register('contactPerson'), 'letters')} />
            </Field>
            <Field label="Contact Email" error={errors.contactEmail?.message}>
              <Input type="email" {...guardedField(register('contactEmail'), 'email')} />
            </Field>
            <Field label="Contact Mobile">
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Authorised Person" error={errors.authorizedPerson?.message}>
                  <Input {...guardedField(register('authorizedPerson'), 'letters')} />
                </Field>
                <Field label="Authorised Email" error={errors.authorizedEmail?.message}>
                  <Input type="email" {...guardedField(register('authorizedEmail'), 'email')} />
                </Field>
                <Field label="Authorised Mobile">
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
                    label="Designation"
                    error={errors.directors?.[index]?.designation?.message}
                  >
                    <Select {...register(`directors.${index}.designation` as const)}>
                      <option value="">Select…</option>
                      {DIRECTOR_DESIGNATIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </Select>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Accounts Person Name">
              <Input {...guardedField(register('billingContactPerson'), 'letters')} />
            </Field>
            <Field label="Accounts Person Mobile">
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
