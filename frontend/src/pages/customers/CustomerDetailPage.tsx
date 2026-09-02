import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Pencil,
  Receipt,
  Mail,
  Phone,
  Building2,
  MapPin,
  Contact,
  ShieldCheck,
  Users,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Server,
  Plus,
  Trash2,
} from 'lucide-react';
import { customerApi } from '@/api/resources';
import { adminTaskApi } from '@/api/tasks';
import { TaskBoard } from '@/components/tasks/TaskBoard';
import { apiErrorMessage } from '@/api/client';
import type { Address, Customer, CustomerCredential } from '@/types';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LicenceBadge, InvoiceBadge } from '@/components/shared/status';
import { LoadingBlock, ErrorState, EmptyState, Spinner } from '@/components/shared/states';
import { Avatar, AvatarFallback } from '@/components/ui/misc';
import { formatCurrency, formatDate, initials, cn } from '@/lib/utils';
import { businessTypeLabel, customerName, formatAbn, invoiceTermLabel } from '@/lib/customer';
import { companyFieldsFor } from '@/lib/company';
import { formatPhone, Flag } from '@/components/shared/PhoneInput';
import { countryCodeByName, countryName } from '@/lib/countries';

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

/** One login row — reveal its password inline, or remove it to revoke access. */
function CredentialRow({
  clientId,
  cred,
  onRemove,
  removing,
}: {
  clientId: string;
  cred: CustomerCredential;
  onRemove: () => void;
  removing: boolean;
}) {
  const [revealing, setRevealing] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  // Change-password form (admin can reset any customer login's password).
  const [changing, setChanging] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const reveal = async () => {
    setRevealing(true);
    try {
      const res = await customerApi.revealCredentialById(clientId, cred.id);
      if (res.available && res.password) {
        setPassword(res.password);
        setShow(true);
      } else {
        toast.info('No stored password to reveal for this login');
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not reveal the password'));
    } finally {
      setRevealing(false);
    }
  };

  const saveNewPassword = async () => {
    if (newPass.trim().length < 8) return;
    setSaving(true);
    try {
      await customerApi.changeCredentialPassword(clientId, cred.id, newPass.trim());
      toast.success('Password changed');
      // Drop any previously revealed value so it can't show the old password.
      setPassword(null);
      setShow(false);
      setNewPass('');
      setChanging(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not change the password'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {cred.email}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setChanging((v) => !v)}
          >
            <KeyRound className="h-3.5 w-3.5" /> Change password
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            disabled={removing}
          >
            {removing ? <Spinner /> : <Trash2 className="h-3.5 w-3.5" />} Remove
          </Button>
        </div>
      </div>

      {changing && (
        <div className="mt-3 rounded-lg border border-dashed border-border bg-card p-3">
          <label className="text-xs font-medium text-muted-foreground">New password</label>
          <div className="relative mt-1.5">
            <Input
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              className="pr-10"
              placeholder="At least 8 characters"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowNew((s) => !s)}
              aria-label={showNew ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={saveNewPassword}
              disabled={saving || newPass.trim().length < 8}
            >
              {saving ? <Spinner /> : null} Save password
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setChanging(false);
                setNewPass('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-2">
        {password ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
              {show ? password : '•'.repeat(Math.max(password.length, 8))}
            </code>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShow((s) => !s)}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard?.writeText(password);
                toast.success('Password copied');
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={reveal} disabled={revealing}>
            {revealing ? <Spinner /> : <Eye className="h-3.5 w-3.5" />} Reveal password
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * All portal logins for a customer, with an add form so an admin can grant
 * access to more than one person.
 */
function CredentialsPanel({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showNew, setShowNew] = useState(false);

  const { data: creds, isLoading } = useQuery({
    queryKey: ['customer-credentials', clientId],
    queryFn: () => customerApi.listCredentials(clientId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['customer-credentials', clientId] });
    qc.invalidateQueries({ queryKey: ['customer', clientId] });
  };

  const addMutation = useMutation({
    mutationFn: () => customerApi.addCredential(clientId, { email: email.trim(), password }),
    onSuccess: () => {
      toast.success('Access granted — new login added');
      setEmail('');
      setPassword('');
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not add the login')),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => customerApi.removeCredential(clientId, userId),
    onSuccess: () => {
      toast.success('Login removed — access revoked');
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not remove the login')),
  });

  const canAdd = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && password.trim().length >= 8;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <KeyRound className="h-[18px] w-[18px]" />
        </div>
        <div>
          <CardTitle className="text-base">Customer Credentials</CardTitle>
          <p className="text-sm text-muted-foreground">
            Portal logins for this customer — grant access to more than one person.
          </p>
        </div>
        <Badge variant="secondary" className="ml-auto">
          Admin only
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <LoadingBlock />
        ) : creds?.length ? (
          <div className="space-y-3">
            {creds.map((cred) => (
              <CredentialRow
                key={cred.id}
                clientId={clientId}
                cred={cred}
                onRemove={() => removeMutation.mutate(cred.id)}
                removing={removeMutation.isPending && removeMutation.variables === cred.id}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No portal logins yet. Add one below to give this customer access.
          </p>
        )}

        {/* Add another login */}
        <div className="rounded-lg border border-dashed border-border p-4">
          <p className="mb-3 text-sm font-medium">Add a login</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email (User ID)</label>
              <Input
                type="email"
                autoComplete="off"
                placeholder="person@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Password</label>
              <div className="relative">
                <Input
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="pr-10"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowNew((s) => !s)}
                  aria-label={showNew ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <Button
            type="button"
            className="mt-3"
            onClick={() => addMutation.mutate()}
            disabled={!canAdd || addMutation.isPending}
          >
            {addMutation.isPending ? <Spinner /> : <Plus className="h-4 w-4" />} Add login
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const ACCOUNT_STATUS: Record<
  NonNullable<Customer['accountStatusEffective']>,
  { label: string; variant: 'success' | 'warning' | 'destructive' }
> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  DORMANT: { label: 'Dormant', variant: 'warning' },
  SUSPENDED: { label: 'Suspended', variant: 'destructive' },
};

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
          title={customerName(c)}
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
            <AvatarFallback className="text-lg">
              {initials(...(customerName(c).split(' ') as [string, string?]))}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold">{customerName(c)}</p>
              <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                {c.clientId}
              </span>
              {c.businessType && (
                <Badge variant="secondary">{businessTypeLabel(c.businessType)}</Badge>
              )}
              {c.status === 'ARCHIVED' && (
                <Badge variant="muted">{c.status}</Badge>
              )}
              {(() => {
                const s = ACCOUNT_STATUS[c.accountStatusEffective ?? c.accountStatus];
                return <Badge variant={s.variant}>{s.label}</Badge>;
              })()}
              {!c.authorized && (
                <Badge variant="default">
                  <ShieldCheck className="h-3 w-3" /> Authorised rep
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {c.contactEmail && (
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> {c.contactEmail}
                </span>
              )}
              {c.contactMobile && (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {formatPhone(c.contactMobile, c.contactMobileCountry)}
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
            <div
              className={cn(
                'shrink-0 rounded-lg border px-4 py-2 text-center',
                // 500+ is healthy (green); anything below is a risk flag (red).
                c.creditScore >= 500
                  ? 'border-success/30 bg-success/10'
                  : 'border-destructive/30 bg-destructive/10'
              )}
            >
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Credit Score</p>
              <p
                className={cn(
                  'text-xl font-semibold tabular-nums',
                  c.creditScore >= 500 ? 'text-success' : 'text-destructive'
                )}
              >
                {c.creditScore}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="products">Products & Licences</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="credential">Credential</TabsTrigger>
          <TabsTrigger value="task">Task</TabsTrigger>
        </TabsList>

        {/* Mirrors the Add/Edit form section-for-section so the two read the same. */}
        <TabsContent value="overview">
          {/* Masonry-style columns so cards pack tightly — a fixed grid left big
              empty gaps under the shorter cards (each row grew to its tallest). */}
          <div className="columns-1 gap-6 lg:columns-2 [&>*]:mb-6 [&>*]:break-inside-avoid">
            <Section icon={Building2} title="Company Information">
              <Detail
                label="Registration Country"
                value={
                  c.registrationCountry ? (
                    <span className="flex items-center gap-1.5">
                      <Flag code={c.registrationCountry} />
                      {countryName(c.registrationCountry)}
                    </span>
                  ) : null
                }
              />
              {(() => {
                // Prefer the stored identifier map; fall back to legacy ABN/ACN columns.
                const ids =
                  c.companyIdentifiers ??
                  (c.abn || c.acn ? { abn: c.abn ?? '', acn: c.acn ?? '' } : {});
                return companyFieldsFor(c.registrationCountry).map((f) => {
                  const val = ids[f.key];
                  if (!val) return null;
                  return (
                    <Detail key={f.key} label={f.label} value={f.key === 'abn' ? formatAbn(val) : val} />
                  );
                });
              })()}
              <Detail label="Business Name" value={c.companyName} />
              {/* A business can trade under several names — list them all, with
                  the primary first. Older records carry only tradingAs. */}
              <Detail
                label={
                  (c.tradingNames?.length ?? 0) > 1
                    ? `Trading As (${c.tradingNames!.length})`
                    : 'Trading As'
                }
                value={
                  c.tradingNames?.length ? (
                    <ul className="space-y-0.5">
                      {c.tradingNames.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  ) : (
                    c.tradingAs
                  )
                }
              />
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
              {!c.authorized && (
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

            {!!c.directors?.length && (
              <Section icon={Users} title="Company C-Suite Details">
                <div className="sm:col-span-2 space-y-3">
                  {c.directors.map((d, i) => (
                    <div
                      key={d.id}
                      className="rounded-lg border border-border bg-secondary/30 p-3 text-sm"
                    >
                      <p className="mb-1 font-medium">
                        {[d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ') ||
                          `Director ${i + 1}`}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" /> {d.email}
                        </span>
                        {d.contactNumber && (
                          <span className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5" />
                            {formatPhone(d.contactNumber, d.contactNumberCountry)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {!!c.itContacts?.length && (
              <Section icon={Server} title="IT Details">
                <div className="sm:col-span-2 space-y-3">
                  {c.itContacts.map((it, i) => (
                    <div
                      key={it.id}
                      className="rounded-lg border border-border bg-secondary/30 p-3 text-sm"
                    >
                      <p className="mb-1 font-medium">{it.name || `IT Contact ${i + 1}`}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                        {it.email && (
                          <span className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" /> {it.email}
                          </span>
                        )}
                        {it.phone && (
                          <span className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5" />
                            {formatPhone(it.phone, it.phoneCountry)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

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
              <Detail label="Invoice Term" value={invoiceTermLabel(c.invoiceTerm) || null} />
              <Detail label="Payment Method" value={c.paymentMethod} />
              <Detail
                label="Account Status"
                value={(() => {
                  const s = ACCOUNT_STATUS[c.accountStatusEffective ?? c.accountStatus];
                  return <Badge variant={s.variant}>{s.label}</Badge>;
                })()}
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

        <TabsContent value="credential">
          <CredentialsPanel clientId={c.clientId} />
        </TabsContent>

        <TabsContent value="task">
          <TaskBoard api={adminTaskApi(c.clientId)} scopeKey={c.clientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
