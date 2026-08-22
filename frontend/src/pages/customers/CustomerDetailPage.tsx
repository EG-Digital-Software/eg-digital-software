import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Pencil,
  Receipt,
  Mail,
  Phone,
  Building2,
  MapPin,
  UserRound,
  Contact,
  ShieldCheck,
} from 'lucide-react';
import { customerApi } from '@/api/resources';
import type { Address, Customer } from '@/types';
import { PageHeader } from '@/components/shared/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LicenceBadge, InvoiceBadge } from '@/components/shared/status';
import { LoadingBlock, ErrorState, EmptyState } from '@/components/shared/states';
import { Avatar, AvatarFallback } from '@/components/ui/misc';
import { formatCurrency, formatDate, initials } from '@/lib/utils';
import { businessTypeLabel, formatAbn, formatAcn } from '@/lib/customer';
import { formatPhone, Flag } from '@/components/shared/PhoneInput';
import { countryCodeByName } from '@/lib/countries';

/**
 * Address rendered the way the form collects it: street, then country, city and
 * postcode. `state` only shows for legacy records captured before the form
 * dropped that field.
 */
function AddressBlock({ address }: { address?: Address }) {
  if (!address) return <span className="text-muted-foreground">—</span>;
  const locality = [address.city, address.state, address.postcode].filter(Boolean).join(' ');
  if (!address.line1 && !locality && !address.country) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="flex items-start gap-1.5">
      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        {address.line1 && <span className="block">{address.line1}</span>}
        {address.line2 && <span className="block">{address.line2}</span>}
        {locality && <span className="block">{locality}</span>}
        {address.country && (
          <span className="mt-0.5 flex items-center gap-1.5">
            <Flag code={countryCodeByName(address.country)} />
            {address.country}
          </span>
        )}
      </span>
    </span>
  );
}

/** Phone with its country flag, or a dash when nothing is stored. */
function PhoneValue({ number, country }: { number?: string | null; country?: string | null }) {
  if (!number) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex items-center gap-1.5">
      <Flag code={country} />
      {formatPhone(number, country)}
    </span>
  );
}

function Detail({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 break-words text-sm font-medium">
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

function Section({
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
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

/** Principal address is the customer's real-world location; fall back to billing. */
function primaryAddress(c: Customer) {
  return (
    c.addresses?.find((a) => a.type === 'PRINCIPAL') ?? c.addresses?.find((a) => a.type === 'BILLING')
  );
}

export default function CustomerDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { data: c, isLoading, isError, refetch } = useQuery({
    queryKey: ['customer', clientId],
    queryFn: () => customerApi.get(clientId!),
  });

  if (isLoading) return <LoadingBlock label="Loading customer…" />;
  if (isError || !c) return <ErrorState onRetry={refetch} />;

  const principal = c.addresses?.find((a) => a.type === 'PRINCIPAL');
  const billing = c.addresses?.find((a) => a.type === 'BILLING');
  const here = primaryAddress(c);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/customers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title={c.companyName || `${c.firstName} ${c.lastName}`}
          description={c.clientId}
          actions={
            <>
              <Button variant="outline" asChild>
                <Link to={`/admin/customers/${c.clientId}/edit`}>
                  <Pencil className="h-4 w-4" /> Edit
                </Link>
              </Button>
              <Button onClick={() => navigate(`/admin/billing/new?clientId=${c.clientId}`)}>
                <Receipt className="h-4 w-4" /> Create Invoice
              </Button>
            </>
          }
        />
      </div>

      {/* Profile card */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-lg">{initials(c.firstName, c.lastName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold">
                {c.firstName} {c.lastName}
              </p>
              <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                {c.clientId}
              </span>
              {c.businessType && (
                <Badge variant="secondary">{businessTypeLabel(c.businessType)}</Badge>
              )}
              <Badge variant={c.status === 'ACTIVE' ? 'success' : 'muted'}>{c.status}</Badge>
              {c.authorized && (
                <Badge variant="default">
                  <ShieldCheck className="h-3 w-3" /> Authorised rep
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {c.email}
              </span>
              {c.phoneNumber && (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {formatPhone(c.phoneNumber, c.phoneNumberCountry)}
                </span>
              )}
              {c.companyName && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> {c.companyName}
                </span>
              )}
              {here?.city && (
                <span className="flex items-center gap-1.5">
                  <Flag code={countryCodeByName(here.country)} />
                  {[here.city, here.country].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          </div>
          {c.creditScore != null && (
            <div className="shrink-0 rounded-lg border border-border bg-secondary/40 px-4 py-2 text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Credit Score</p>
              <p className="text-xl font-semibold tabular-nums">{c.creditScore}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="products">Products & Licences</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        {/* Mirrors the Add/Edit form section-for-section so the two read the same. */}
        <TabsContent value="overview">
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Section icon={UserRound} title="Basic Information">
              <Detail label="First Name" value={c.firstName} />
              <Detail label="Last Name" value={c.lastName} />
              <Detail label="Email" value={c.email} />
              <Detail
                label="Phone Number"
                value={<PhoneValue number={c.phoneNumber} country={c.phoneNumberCountry} />}
              />
            </Section>

            <Section icon={Building2} title="Company Information">
              <Detail label="ABN Number" value={formatAbn(c.abn)} />
              <Detail label="ACN" value={formatAcn(c.acn)} />
              <Detail label="Business Name" value={c.companyName} />
              <Detail label="Trading As" value={c.tradingAs} />
              <Detail
                label="Business Type"
                value={
                  c.businessType ? (
                    <Badge variant="secondary">{businessTypeLabel(c.businessType)}</Badge>
                  ) : null
                }
              />
              <Detail
                label="Client ID"
                value={<span className="font-mono text-primary">{c.clientId}</span>}
              />
              <Detail label="Principal Address" value={<AddressBlock address={principal} />} />
              <Detail label="Billing Address" value={<AddressBlock address={billing} />} />
            </Section>

            <Section icon={Contact} title="Contact Information">
              <Detail label="Contact Name" value={c.contactPerson} />
              <Detail label="Contact Position" value={c.contactPosition} />
              <Detail label="Contact Email" value={c.contactEmail} />
              <Detail
                label="Contact Mobile"
                value={<PhoneValue number={c.contactMobile} country={c.contactMobileCountry} />}
              />
              <Detail label="Authorised" value={c.authorized ? 'Yes' : 'No'} />
              {c.authorized && (
                <>
                  <Detail label="Authorised Person" value={c.authorizedPerson} />
                  <Detail label="Authorised Email" value={c.authorizedEmail} />
                  <Detail
                    label="Authorised Mobile"
                    value={
                      <PhoneValue number={c.authorizedMobile} country={c.authorizedMobileCountry} />
                    }
                  />
                </>
              )}
            </Section>

            <Section icon={Receipt} title="Invoicing Details">
              <Detail label="Accounts Person Name" value={c.billingContactPerson} />
              <Detail
                label="Accounts Person Mobile"
                value={
                  <PhoneValue
                    number={c.billingContactNumber}
                    country={c.billingContactNumberCountry}
                  />
                }
              />
              <Detail label="Accounts Person Email" value={c.billingEmail} />
              <Detail
                label="Credit Score"
                value={c.creditScore != null ? String(c.creditScore) : null}
              />
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardContent className="p-0">
              {!c.customerProducts?.length ? (
                <div className="p-6">
                  <EmptyState title="No products assigned" description="Assign products when editing this customer." />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Licence</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead>Issued</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.customerProducts.map((cp) => (
                      <TableRow key={cp.id}>
                        <TableCell>
                          <p className="font-medium">{cp.product.name}</p>
                          <p className="text-xs text-muted-foreground">{cp.product.sku ?? cp.product.productCode}</p>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{cp.licence?.licenceKey ?? '—'}</TableCell>
                        <TableCell className="text-center tabular-nums">{cp.quantity}</TableCell>
                        <TableCell className="text-sm">{formatDate(cp.issueDate)}</TableCell>
                        <TableCell className="text-sm">{formatDate(cp.expiryDate)}</TableCell>
                        <TableCell>
                          <LicenceBadge status={cp.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardContent className="p-0">
              {!c.invoices?.length ? (
                <div className="p-6">
                  <EmptyState
                    title="No invoices yet"
                    description="Create an invoice for this customer."
                    action={
                      <Button onClick={() => navigate(`/admin/billing/new?clientId=${c.clientId}`)}>
                        <Receipt className="h-4 w-4" /> Create Invoice
                      </Button>
                    }
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.invoices.map((inv) => (
                      <TableRow
                        key={inv.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/admin/billing/${inv.id}`)}
                      >
                        <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                        <TableCell className="text-sm">{formatDate(inv.invoiceDate)}</TableCell>
                        <TableCell className="text-sm">{formatDate(inv.dueDate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(inv.total)}</TableCell>
                        <TableCell>
                          <InvoiceBadge status={inv.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
