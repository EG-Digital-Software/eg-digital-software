import { useEffect, useState, forwardRef, type ReactNode, type InputHTMLAttributes } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CreditCard,
  Landmark,
  KeyRound,
  Save,
  ShieldCheck,
  Smartphone,
  Copy,
  Check,
  PlugZap,
  CircleCheck,
  CircleAlert,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { settingsApi, type PaymentSettingsInput } from '@/api/resources';
import { api, apiErrorMessage } from '@/api/client';
import { Input, Textarea, Select } from '@/components/ui/input';
import { numericField, titleCaseField } from '@/lib/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LoadingBlock, ErrorState, Spinner } from '@/components/shared/states';

const schema = z.object({
  provider: z.enum(['worldline', 'mock', 'stripe', 'razorpay']),
  publishableKey: z.string().max(255).optional(),
  secretKey: z.string().max(255).optional(),
  worldlineEnvironment: z.enum(['live', 'test']),
  worldlineMerchantId: z.string().max(60).optional(),
  worldlineApiKeyId: z.string().max(120).optional(),
  worldlineApiSecret: z.string().max(255).optional(),
  worldlineWebhookKeyId: z.string().max(120).optional(),
  worldlineWebhookSecret: z.string().max(255).optional(),
  cardPaymentsEnabled: z.boolean(),
  upiEnabled: z.boolean(),
  upiId: z.string().max(120).optional(),
  bankTransferEnabled: z.boolean(),
  bankName: z.string().max(120).optional(),
  accountName: z.string().max(120).optional(),
  bsb: z.string().max(20).optional(),
  accountNumber: z.string().max(40).optional(),
  payInstructions: z.string().max(2000).optional(),
});
type FormValues = z.infer<typeof schema>;

/** Where Worldline must send webhooks — pasted into the Merchant Portal. */
const WORLDLINE_WEBHOOK_URL = `${String(api.defaults.baseURL ?? '').replace(/\/$/, '')}/payments/webhook/worldline`;

export default function PaymentSettingsForm() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'payment-settings'],
    queryFn: settingsApi.getPayment,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      provider: 'worldline',
      worldlineEnvironment: 'live',
      cardPaymentsEnabled: true,
      upiEnabled: false,
      bankTransferEnabled: false,
    },
  });

  // Hydrate the form once settings load (secret key stays blank — masked).
  useEffect(() => {
    if (!data) return;
    reset({
      provider: data.provider,
      publishableKey: data.publishableKey ?? '',
      secretKey: '',
      worldlineEnvironment: data.worldlineEnvironment ?? 'live',
      worldlineMerchantId: data.worldlineMerchantId ?? '',
      worldlineApiKeyId: data.worldlineApiKeyId ?? '',
      worldlineApiSecret: '',
      worldlineWebhookKeyId: data.worldlineWebhookKeyId ?? '',
      worldlineWebhookSecret: '',
      cardPaymentsEnabled: data.cardPaymentsEnabled,
      upiEnabled: data.upiEnabled,
      upiId: data.upiId ?? '',
      bankTransferEnabled: data.bankTransferEnabled,
      bankName: data.bankName ?? '',
      accountName: data.accountName ?? '',
      bsb: data.bsb ?? '',
      accountNumber: data.accountNumber ?? '',
      payInstructions: data.payInstructions ?? '',
    });
  }, [data, reset]);

  const save = useMutation({
    mutationFn: (body: PaymentSettingsInput) => settingsApi.updatePayment(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'payment-settings'] });
      qc.invalidateQueries({ queryKey: ['public-payment-settings'] });
      toast.success('Payment settings saved');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not save settings')),
  });

  const onSubmit = (values: FormValues) => {
    // Only send a secret when the admin actually typed a new one.
    const body: PaymentSettingsInput = { ...values };
    if (!values.secretKey) delete body.secretKey;
    if (!values.worldlineApiSecret) delete body.worldlineApiSecret;
    if (!values.worldlineWebhookSecret) delete body.worldlineWebhookSecret;
    return save.mutateAsync(body);
  };

  const test = useMutation({
    mutationFn: settingsApi.testWorldline,
    onSuccess: (r) =>
      r.ok
        ? toast.success(`Connected to ANZ Worldline (${r.environment}) as ${r.merchantId}`)
        : toast.error(`Worldline answered "${r.result ?? 'unknown'}"`),
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not reach ANZ Worldline')),
  });

  if (isLoading) return <LoadingBlock label="Loading payment settings…" />;
  if (isError || !data) return <ErrorState onRetry={refetch} />;

  const provider = watch('provider');
  const upiOn = watch('upiEnabled');
  const bankOn = watch('bankTransferEnabled');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="ec-page" style={{ maxWidth: 860 }}>
      <div
        className="glass"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px' }}
      >
        <p className="muted" style={{ margin: 0, maxWidth: 600, fontSize: 13.5 }}>
          Configure your payment gateway and bank transfer details. These appear on invoices and the
          pay page. Card surcharges are not charged — they are banned in Australia from 1 October 2026.
        </p>
        <Button type="submit" disabled={isSubmitting || save.isPending || !isDirty}>
          {save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save changes
        </Button>
      </div>

      {/* Gateway */}
      <section className="glass up">
        <SectionHead icon={KeyRound} title="Payment gateway" />
        <div className="grid grid-cols-1 gap-4 p-[22px] sm:grid-cols-2">
          <Field label="Provider" error={errors.provider?.message}>
            <Select {...register('provider')}>
              <option value="worldline">ANZ Worldline (Global Online Pay)</option>
              <option value="mock">Mock (development)</option>
              <option value="stripe">Stripe</option>
              <option value="razorpay">Razorpay</option>
            </Select>
          </Field>
          {provider === 'worldline' ? (
            <>
              <Field label="Environment" error={errors.worldlineEnvironment?.message}>
                <Select {...register('worldlineEnvironment')}>
                  <option value="live">Live — real payments</option>
                  <option value="test">Test (pre-production)</option>
                </Select>
              </Field>
              <Field
                label="Merchant ID (PSPID)"
                hint="Top of the Merchant Portal"
                error={errors.worldlineMerchantId?.message}
              >
                <Input autoComplete="off" placeholder="e.g. EGEloma" {...register('worldlineMerchantId')} />
              </Field>
              <div className="hidden sm:block" />
              <Field
                label="API Key ID"
                hint="Developer › Payment API"
                error={errors.worldlineApiKeyId?.message}
              >
                <Input autoComplete="off" {...register('worldlineApiKeyId')} />
              </Field>
              <Field
                label="API Secret"
                hint={
                  data.hasWorldlineApiSecret
                    ? `Saved · ends ••${data.worldlineApiSecretLast4}`
                    : 'Not set'
                }
                error={errors.worldlineApiSecret?.message}
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder={data.hasWorldlineApiSecret ? 'Leave blank to keep current' : ''}
                  {...register('worldlineApiSecret')}
                />
              </Field>
              <Field
                label="Webhook Key ID"
                hint="Developer › Webhooks"
                error={errors.worldlineWebhookKeyId?.message}
              >
                <Input autoComplete="off" {...register('worldlineWebhookKeyId')} />
              </Field>
              <Field
                label="Webhook Secret"
                hint={
                  data.hasWorldlineWebhookSecret
                    ? `Saved · ends ••${data.worldlineWebhookSecretLast4}`
                    : 'Not set'
                }
                error={errors.worldlineWebhookSecret?.message}
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder={data.hasWorldlineWebhookSecret ? 'Leave blank to keep current' : ''}
                  {...register('worldlineWebhookSecret')}
                />
              </Field>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Webhook URL</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={WORLDLINE_WEBHOOK_URL} className="font-mono text-xs" />
                  <CopyButton value={WORLDLINE_WEBHOOK_URL} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Add this under Developer › Webhooks › Add webhook endpoint in the Worldline
                  Merchant Portal.
                </p>
              </div>
              <div className="tile flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
                <span className="flex items-center gap-2 text-sm">
                  {data.worldlineReady ? (
                    <span className="chip c-ok" style={{ whiteSpace: 'normal' }}>
                      <CircleCheck className="h-3.5 w-3.5" /> Card payments go through ANZ Worldline
                    </span>
                  ) : (
                    <span className="chip c-red" style={{ whiteSpace: 'normal' }}>
                      <CircleAlert className="h-3.5 w-3.5" /> Enter the PSPID, API Key ID and API Secret, then save
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!data.worldlineReady || isDirty || test.isPending}
                  title={isDirty ? 'Save your changes first' : undefined}
                  onClick={() => test.mutate()}
                >
                  {test.isPending ? <Spinner /> : <PlugZap className="h-4 w-4" />} Test connection
                </Button>
              </div>
            </>
          ) : (
            <>
          <div className="hidden sm:block" />
          <Field label="Publishable / public key" error={errors.publishableKey?.message}>
            <Input
              placeholder={provider === 'razorpay' ? 'rzp_live_…' : 'pk_live_…'}
              {...register('publishableKey')}
            />
          </Field>
          <Field
            label="Secret key"
            hint={data.hasSecretKey ? `Saved · ends ••${data.secretKeyLast4}` : 'Not set'}
            error={errors.secretKey?.message}
          >
            <Input
              type="password"
              autoComplete="new-password"
              placeholder={data.hasSecretKey ? 'Leave blank to keep current' : 'sk_live_…'}
              {...register('secretKey')}
            />
          </Field>
            </>
          )}
          <p className="sm:col-span-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Secret keys are stored securely and never shown
            again after saving. Live charges require a real gateway; “Mock” simulates payments for
            testing.
          </p>
        </div>
      </section>

      {/* Card payments */}
      <section className="glass up">
        <SectionHead icon={CreditCard} title="Card payments" />
        <div className="space-y-4 p-[22px]">
          <Toggle
            label="Accept card payments"
            description="Show card options (Visa, Mastercard, Amex, Google Pay) on invoices and the pay page."
            {...register('cardPaymentsEnabled')}
          />
        </div>
      </section>

      {/* UPI / Google Pay */}
      <section className="glass up">
        <SectionHead icon={Smartphone} title="UPI / Google Pay" />
        <div className="space-y-4 p-[22px]">
          <Toggle
            label="Accept UPI / Google Pay / PhonePe"
            description="Show a UPI option (with QR + intent link) on invoices and the pay page."
            {...register('upiEnabled')}
          />
          <Field
            label="UPI ID (VPA)"
            hint="e.g. egdigital@okhdfcbank"
            error={errors.upiId?.message}
          >
            <Input
              disabled={!upiOn}
              placeholder="yourbusiness@okhdfcbank"
              className="max-w-sm"
              {...register('upiId')}
            />
          </Field>
        </div>
      </section>

      {/* Bank transfer */}
      <section className="glass up">
        <SectionHead icon={Landmark} title="Bank transfer (EFT)" />
        <div className="space-y-4 p-[22px]">
          <Toggle
            label="Offer bank transfer"
            description="Display these account details on invoices and the pay page for direct deposit."
            {...register('bankTransferEnabled')}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Account name" error={errors.accountName?.message}>
              <Input disabled={!bankOn} placeholder="EG Eloma" {...titleCaseField(register('accountName'))} />
            </Field>
            <Field label="Bank name" error={errors.bankName?.message}>
              <Input disabled={!bankOn} placeholder="e.g. Commonwealth Bank" {...titleCaseField(register('bankName'))} />
            </Field>
            <Field label="BSB" error={errors.bsb?.message}>
              <Input disabled={!bankOn} maxLength={6} placeholder="000000" {...numericField(register('bsb'))} />
            </Field>
            <Field label="Account number" error={errors.accountNumber?.message}>
              <Input disabled={!bankOn} maxLength={10} placeholder="12345678" {...numericField(register('accountNumber'))} />
            </Field>
          </div>
        </div>
      </section>

      {/* Instructions */}
      <section className="glass up">
        <SectionHead icon={FileText} title="Payment instructions / note" />
        <div className="p-[22px]">
          <Field label="Note shown on invoice & pay page" error={errors.payInstructions?.message}>
            <Textarea
              rows={3}
              placeholder="e.g. Please use your invoice number as the payment reference."
              {...register('payInstructions')}
            />
          </Field>
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || save.isPending || !isDirty}>
          {save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save changes
        </Button>
      </div>
    </form>
  );
}

/** Header row of a glass settings section (icon tile + title). */
function SectionHead({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: '1px solid rgba(var(--w),.06)' }}
    >
      <span className="ico">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <h2 className="disp" style={{ margin: 0, fontSize: 18 }}>
        {title}
      </h2>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Webhook URL copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy — please select the text manually');
    }
  };
  return (
    <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy webhook URL">
      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        {hint && !error && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const Toggle = forwardRef<
  HTMLInputElement,
  { label: string; description?: string } & InputHTMLAttributes<HTMLInputElement>
>(({ label, description, ...props }, ref) => (
  <label className="flex items-start gap-3">
    <input
      ref={ref}
      type="checkbox"
      className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
      {...props}
    />
    <span>
      <span className="block text-sm font-medium">{label}</span>
      {description && <span className="block text-xs text-muted-foreground">{description}</span>}
    </span>
  </label>
));
Toggle.displayName = 'Toggle';
