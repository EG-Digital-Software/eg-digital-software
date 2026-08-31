import { useQuery } from '@tanstack/react-query';
import { Building2, Contact, Receipt, MapPin, Users, Lock } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { PageHeader } from '@/components/shared/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { ErrorState } from '@/components/shared/states';
import type { Address } from '@/types';

/** Turn an enum like HOSPITALITY_AND_TOURISM into "Hospitality And Tourism". */
function prettify(value?: string | null): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="w-48 shrink-0 text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value?.toString().trim() ? value : '—'}</dd>
    </div>
  );
}

function DetailCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Building2;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 border-b border-border/60 bg-secondary/30">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <dl className="divide-y divide-border/50">{children}</dl>
      </CardContent>
    </Card>
  );
}

function oneLineAddress(a?: Address): string {
  if (!a) return '—';
  return [a.line1, a.line2, a.suburb, a.city, a.state, a.postcode, a.country]
    .filter((p) => p && p.toString().trim())
    .join(', ');
}

export default function ClientDetailsPage() {
  const { data: c, isLoading, isError, refetch } = useQuery({
    queryKey: ['client', 'profile'],
    queryFn: () => clientApi.profile(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError || !c) return <ErrorState onRetry={refetch} />;

  const principal = c.addresses?.find((a) => a.type === 'PRINCIPAL');
  const billing = c.addresses?.find((a) => a.type === 'BILLING');
  const identifiers = c.companyIdentifiers ?? {};

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Details"
        description="Your account details on record. These are managed by EG Digital — to update anything, please get in touch."
      />

      <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-4 py-2.5 text-sm text-muted-foreground">
        <Lock className="h-4 w-4 shrink-0" />
        This information is read-only. You can change your password from{' '}
        <span className="font-medium text-foreground">My Account</span>.
      </div>

      <DetailCard icon={Building2} title="Company Information">
        <Row label="Client ID" value={c.clientId} />
        <Row label="Company Name" value={c.companyName} />
        <Row label="Trading As" value={c.tradingAs} />
        <Row label="Business Type" value={prettify(c.businessType)} />
        <Row label="Registration Country" value={c.registrationCountry} />
        {Object.entries(identifiers).map(([key, val]) => (
          <Row key={key} label={key.toUpperCase()} value={val} />
        ))}
      </DetailCard>

      <DetailCard icon={Contact} title="Contact Information">
        <Row label="Contact Person" value={c.contactPerson} />
        <Row label="Email" value={c.contactEmail} />
        <Row label="Mobile" value={c.contactMobile} />
        <Row label="Position" value={c.contactPosition} />
      </DetailCard>

      <DetailCard icon={Receipt} title="Invoicing Details">
        <Row label="Invoice Customer" value={c.invoiceCustomer} />
        <Row label="Accounts Email" value={c.billingEmail} />
        <Row label="Invoice Term" value={c.invoiceTerm} />
        <Row label="Payment Method" value={c.paymentMethod} />
      </DetailCard>

      <DetailCard icon={MapPin} title="Addresses">
        <Row label="Principal Address" value={oneLineAddress(principal)} />
        <Row label="Billing Address" value={oneLineAddress(billing)} />
      </DetailCard>

      {!!c.directors?.length && (
        <DetailCard icon={Users} title="Company Directors">
          {c.directors.map((d) => (
            <Row
              key={d.id}
              label={[d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ') || 'Director'}
              value={[d.email, d.contactNumber].filter(Boolean).join(' · ')}
            />
          ))}
        </DetailCard>
      )}
    </div>
  );
}
