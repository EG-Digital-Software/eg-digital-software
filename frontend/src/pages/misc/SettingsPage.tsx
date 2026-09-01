import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, MapPin, Mail, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { settingsApi, type OrganisationSettings } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { PageHeader } from '@/components/shared/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { numericField, titleCaseField } from '@/lib/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LoadingBlock, ErrorState, Spinner } from '@/components/shared/states';
import { PhoneInput, CountrySelect } from '@/components/shared/PhoneInput';
import { DEFAULT_COUNTRY, countryCodeByName, countryName } from '@/lib/countries';

const schema = z.object({
  companyName: z.string().min(1, 'Required').max(120),
  legalName: z.string().max(160).optional(),
  abn: z
    .string()
    .optional()
    .refine((v) => {
      const d = (v ?? '').replace(/\D/g, '');
      return d.length === 0 || d.length === 11;
    }, 'ABN must be 11 digits'),
  addressLine1: z.string().max(160).optional(),
  addressLine2: z.string().max(160).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(40).optional(),
  postcode: z.string().max(20).optional(),
  /** ISO code in the form; sent to the API as the country name. */
  country: z.string().optional(),
  billingEmail: z.string().email('Enter a valid email').optional().or(z.literal('')),
  supportEmail: z.string().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  phoneCountry: z.string().optional(),
  website: z.string().max(200).optional(),
  disputeWindowDays: z
    .string()
    .optional()
    .refine((v) => {
      if (!v?.trim()) return true;
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n <= 365;
    }, 'Must be a whole number of days between 0 and 365'),
});
type FormValues = z.input<typeof schema>;

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
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

/**
 * Organisation settings — the issuing entity printed on every tax invoice.
 * These were previously hardcoded constants in the frontend bundle, so an ABN
 * or address change needed a code edit and a redeploy.
 */
export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'organisation'],
    queryFn: settingsApi.getOrganisation,
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!data) return;
    reset({
      companyName: data.companyName,
      legalName: data.legalName ?? '',
      abn: data.abn ?? '',
      addressLine1: data.addressLine1 ?? '',
      addressLine2: data.addressLine2 ?? '',
      city: data.city ?? '',
      state: data.state ?? '',
      postcode: data.postcode ?? '',
      country: countryCodeByName(data.country),
      billingEmail: data.billingEmail ?? '',
      supportEmail: data.supportEmail ?? '',
      phone: data.phone ?? '',
      phoneCountry: data.phoneCountry ?? DEFAULT_COUNTRY,
      website: data.website ?? '',
      disputeWindowDays: data.disputeWindowDays != null ? String(data.disputeWindowDays) : '',
    });
  }, [data, reset]);

  const save = useMutation({
    mutationFn: (body: Partial<OrganisationSettings>) => settingsApi.updateOrganisation(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'organisation'] });
      // Invoices print these details, so refresh their cached copy too.
      qc.invalidateQueries({ queryKey: ['public-organisation'] });
      toast.success('Organisation settings saved');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not save settings')),
  });

  if (isLoading) return <LoadingBlock label="Loading settings…" />;
  if (isError || !data) return <ErrorState onRetry={refetch} />;

  const onSubmit = (values: FormValues) =>
    save.mutateAsync({
      ...values,
      country: countryName(values.country) || 'Australia',
      disputeWindowDays: values.disputeWindowDays?.trim()
        ? Number(values.disputeWindowDays)
        : undefined,
    } as Partial<OrganisationSettings>);

  const SaveButton = (
    <Button type="submit" disabled={isSubmitting || save.isPending || !isDirty}>
      {save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save changes
    </Button>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Settings"
        description="Your organisation's details — these print on every tax invoice and the pay page"
        actions={SaveButton}
      />

      <Section icon={Building2} title="Organisation">
        <Field label="Company Name" error={errors.companyName?.message}>
          <Input {...titleCaseField(register('companyName'))} />
        </Field>
        <Field label="Legal / Registered Name" hint="Shown as the issuing entity on invoices">
          <Input placeholder="EG Digital Australia Pty Ltd" {...titleCaseField(register('legalName'))} />
        </Field>
        <Field label="ABN" error={errors.abn?.message} hint="11 digits">
          <Input maxLength={14} placeholder="76 593 175 012" {...register('abn')} />
        </Field>
        <Field label="Website">
          <Input placeholder="https://egdigital.com.au" {...register('website')} />
        </Field>
      </Section>

      <Section icon={MapPin} title="Trading Address">
        <div className="sm:col-span-2">
          <Field label="Street Address">
            <Input placeholder="Address line 1" {...titleCaseField(register('addressLine1'))} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Input placeholder="Address line 2 (optional)" {...titleCaseField(register('addressLine2'))} />
        </div>
        <div className="sm:col-span-2">
          <Field label="Country">
            <Controller
              control={control}
              name="country"
              render={({ field }) => (
                <CountrySelect value={field.value ?? DEFAULT_COUNTRY} onChange={field.onChange} />
              )}
            />
          </Field>
        </div>
        <Field label="City">
          <Input {...titleCaseField(register('city'))} />
        </Field>
        <Field label="State">
          <Input placeholder="VIC" {...register('state')} />
        </Field>
        <Field label="Postcode">
          <Input maxLength={10} {...register('postcode')} />
        </Field>
      </Section>

      <Section
        icon={Mail}
        title="Contact"
        description="Where customers reach you about invoices and support"
      >
        <Field label="Billing Email" error={errors.billingEmail?.message}>
          <Input type="email" placeholder="billing@egdigital.com.au" {...register('billingEmail')} />
        </Field>
        <Field label="Support Email" error={errors.supportEmail?.message}>
          <Input type="email" placeholder="support@egdigital.com.au" {...register('supportEmail')} />
        </Field>
        <Field label="Phone">
          <Controller
            control={control}
            name="phone"
            render={({ field: numField }) => (
              <Controller
                control={control}
                name="phoneCountry"
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
        <Field
          label="Invoice Dispute Window"
          error={errors.disputeWindowDays?.message}
          hint="Days customers have to raise a dispute — printed on the invoice"
        >
          <Input maxLength={3} {...numericField(register('disputeWindowDays'))} />
        </Field>
      </Section>

      <Section
        icon={ShieldCheck}
        title="Regional"
        description="Locale and currency are set per environment and apply platform-wide"
      >
        <Field label="Locale" hint="Set via DEFAULT_LOCALE">
          <Input disabled value={data.locale} readOnly />
        </Field>
        <Field label="Currency" hint="Set via DEFAULT_CURRENCY">
          <Input disabled value={data.currency} readOnly />
        </Field>
      </Section>

      <div className="flex justify-end">{SaveButton}</div>
    </form>
  );
}
