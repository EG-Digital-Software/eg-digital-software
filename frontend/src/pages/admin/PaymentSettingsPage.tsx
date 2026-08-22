import { useEffect, forwardRef, type ReactNode, type InputHTMLAttributes } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CreditCard, Landmark, KeyRound, Save, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { settingsApi, type PaymentSettingsInput } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LoadingBlock, ErrorState, Spinner } from '@/components/shared/states';

const schema = z.object({
  provider: z.enum(['mock', 'stripe', 'razorpay']),
  publishableKey: z.string().max(255).optional(),
  secretKey: z.string().max(255).optional(),
  cardPaymentsEnabled: z.boolean(),
  cardSurchargePct: z.coerce.number().min(0, 'Must be 0 or more').max(100, 'Too high'),
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
      provider: 'mock',
      cardPaymentsEnabled: true,
      cardSurchargePct: 0,
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
      cardPaymentsEnabled: data.cardPaymentsEnabled,
      cardSurchargePct: data.cardSurchargePct ?? 0,
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
    // Only send the secret key when the admin actually typed a new one.
    const body: PaymentSettingsInput = { ...values };
    if (!values.secretKey) delete body.secretKey;
    return save.mutateAsync(body);
  };

  if (isLoading) return <LoadingBlock label="Loading payment settings…" />;
  if (isError || !data) return <ErrorState onRetry={refetch} />;

  const provider = watch('provider');
  const cardOn = watch('cardPaymentsEnabled');
  const upiOn = watch('upiEnabled');
  const bankOn = watch('bankTransferEnabled');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Configure your payment gateway, bank transfer details and card surcharge. These appear on
          invoices and the pay page.
        </p>
        <Button type="submit" disabled={isSubmitting || save.isPending || !isDirty}>
          {save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save changes
        </Button>
      </div>

      {/* Gateway */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" /> Payment gateway
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Provider" error={errors.provider?.message}>
            <Select {...register('provider')}>
              <option value="mock">Mock (development)</option>
              <option value="stripe">Stripe</option>
              <option value="razorpay">Razorpay</option>
            </Select>
          </Field>
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
          <p className="sm:col-span-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Secret keys are stored securely and never shown
            again after saving. Live charges require a real gateway; “Mock” simulates payments for
            testing.
          </p>
        </CardContent>
      </Card>

      {/* Card payments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-primary" /> Card payments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            label="Accept card payments"
            description="Show card options (Visa, Mastercard, Amex, Google Pay) on invoices and the pay page."
            {...register('cardPaymentsEnabled')}
          />
          <Field
            label="Card surcharge (%)"
            hint="Fee shown to the customer on card payments. Leave 0 for none."
            error={errors.cardSurchargePct?.message}
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              disabled={!cardOn}
              className="max-w-[160px]"
              {...register('cardSurchargePct')}
            />
          </Field>
        </CardContent>
      </Card>

      {/* UPI / Google Pay */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4 text-primary" /> UPI / Google Pay
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      {/* Bank transfer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4 text-primary" /> Bank transfer (EFT)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            label="Offer bank transfer"
            description="Display these account details on invoices and the pay page for direct deposit."
            {...register('bankTransferEnabled')}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Account name" error={errors.accountName?.message}>
              <Input disabled={!bankOn} placeholder="EG Digital Australia Pty Ltd" {...register('accountName')} />
            </Field>
            <Field label="Bank name" error={errors.bankName?.message}>
              <Input disabled={!bankOn} placeholder="e.g. Commonwealth Bank" {...register('bankName')} />
            </Field>
            <Field label="BSB" error={errors.bsb?.message}>
              <Input disabled={!bankOn} placeholder="000-000" {...register('bsb')} />
            </Field>
            <Field label="Account number" error={errors.accountNumber?.message}>
              <Input disabled={!bankOn} placeholder="12345678" {...register('accountNumber')} />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment instructions / note</CardTitle>
        </CardHeader>
        <CardContent>
          <Field label="Note shown on invoice & pay page" error={errors.payInstructions?.message}>
            <Textarea
              rows={3}
              placeholder="e.g. Please use your invoice number as the payment reference."
              {...register('payInstructions')}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={isSubmitting || save.isPending || !isDirty}>
          {save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save changes
        </Button>
      </div>
    </form>
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
