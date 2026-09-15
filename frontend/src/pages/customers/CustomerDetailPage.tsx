import { useRef, useState } from 'react';
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
  FileText,
  Upload,
  Download,
  SquarePen,
} from 'lucide-react';
import { customerApi, productApi } from '@/api/resources';
import { adminTaskApi } from '@/api/tasks';
import { TaskBoard } from '@/components/tasks/TaskBoard';
import { apiErrorMessage } from '@/api/client';
import type { Address, AgreementField, Customer, CustomerCredential, CustomerDocument, CustomerProduct } from '@/types';
import AgreementFieldsDialog from './AgreementFieldsDialog';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { InvoiceBadge } from '@/components/shared/status';
import { LoadingBlock, ErrorState, EmptyState, Spinner } from '@/components/shared/states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/misc';
import { formatCurrency, formatDate, initials, cn, mediaUrl } from '@/lib/utils';
import { businessTypesLabel, customerName, formatAbn, formatAcn } from '@/lib/customer';
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
          EG only
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
    // Keep the Agreement status in step with the client without a manual refresh.
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
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
          icon={Building2}
          iconTone="primary"
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
                <Badge variant="secondary">{businessTypesLabel(c.businessType)}</Badge>
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
          <TabsTrigger value="agreement">
            Agreement{c.documents && c.documents.length > 0 ? ` (${c.documents.length})` : ''}
          </TabsTrigger>
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
                    <Detail key={f.key} label={f.label} value={f.key === 'abn' ? formatAbn(val) : f.key === 'acn' ? formatAcn(val) : val} />
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
                    <Badge variant="secondary">{businessTypesLabel(c.businessType)}</Badge>
                  ) : null
                }
              />
              <Detail
                label="Customer ID"
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

        <TabsContent value="agreement">
          <AgreementTab customer={c} />
        </TabsContent>

        <TabsContent value="products">
          <ProductsTab customer={c} />
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
          <TaskBoard api={adminTaskApi(c.clientId)} scopeKey={c.clientId} customerName={customerName(c)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const EMPTY_ASSIGN = {
  productId: '',
  price: '',
  unitHours: '', // Unit/Hours multiplier (used only when enabled)
  taxRate: '10', // GST — fixed at 10%
  contractType: 'LOCKED', // LOCKED | TRIAL
  gstType: 'EXCLUSIVE', // INCLUSIVE | EXCLUSIVE
  licence: '',
  issueDate: '',
  expiryDate: '',
};

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/** Days left until expiry from today (expiry − today). 'Expired' when past, '—' if no expiry. */
function daysLeftFromToday(expiryDate?: string | null): string {
  if (!expiryDate) return '—';
  const ms = new Date(expiryDate).getTime() - Date.now();
  if (Number.isNaN(ms)) return '—';
  const days = Math.ceil(ms / 86_400_000);
  return days > 0 ? String(days) : 'Expired';
}

function docSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Agreement tab — the customer's uploaded agreement/contract files. The admin
 * can upload more, rename, approve/revoke and delete each; downloads are the
 * original file at full quality.
 */
function AgreementTab({ customer }: { customer: Customer }) {
  const qc = useQueryClient();
  const clientId = customer.clientId;
  const uploadRef = useRef<HTMLInputElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [fieldsDoc, setFieldsDoc] = useState<CustomerDocument | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['customer', clientId] });
  const docs = customer.documents ?? [];
  const isPdf = (d: CustomerDocument) =>
    d.contentType === 'application/pdf' || /\.pdf$/i.test(d.fileName);

  const upload = useMutation({
    mutationFn: (file: File) => customerApi.addDocument(clientId, file),
    onSuccess: (doc) => {
      refresh();
      toast.success('Document uploaded');
      // Flat PDFs need fields marked before the client can fill them — open the
      // placement tool straight away, as the admin requested.
      if (isPdf(doc)) setFieldsDoc(doc);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const saveFields = useMutation({
    mutationFn: (v: { id: string; fields: AgreementField[] }) =>
      customerApi.updateDocument(clientId, v.id, { fields: v.fields }),
    onSuccess: () => { refresh(); setFieldsDoc(null); toast.success('Fields saved'); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const rename = useMutation({
    mutationFn: (v: { id: string; fileName: string }) => customerApi.updateDocument(clientId, v.id, { fileName: v.fileName }),
    onSuccess: () => { refresh(); toast.success('Document renamed'); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: 'SUBMITTED' | 'APPROVED' }) => customerApi.updateDocument(clientId, v.id, { status: v.status }),
    onSuccess: (_d, v) => { refresh(); toast.success(v.status === 'APPROVED' ? 'Document approved' : 'Approval revoked'); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => customerApi.deleteDocument(clientId, id),
    onSuccess: () => { refresh(); toast.success('Document deleted'); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Agreement Documents</CardTitle>
        <input
          ref={uploadRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }}
        />
        <Button type="button" size="sm" onClick={() => uploadRef.current?.click()} disabled={upload.isPending}>
          <Upload className="h-4 w-4" /> {upload.isPending ? 'Uploading…' : 'Upload'}
        </Button>
      </CardHeader>
      <CardContent>
        {docs.length === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="No agreement documents" description="Upload a signed agreement or contract for this customer." />
        ) : (
          <div className="space-y-2">
            {docs.map((d: CustomerDocument) => {
              const approved = d.status === 'APPROVED';
              const submitted = d.status === 'SUBMITTED';
              const downloadUrl = mediaUrl(d.signedUrl || d.url) ?? '';
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3.5 py-3 text-sm">
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  {renamingId === d.id ? (
                    <div className="flex flex-1 items-center gap-1.5">
                      <Input
                        value={renameValue}
                        autoFocus
                        className="h-8"
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { const v = renameValue.trim(); if (v) rename.mutate({ id: d.id, fileName: v }); setRenamingId(null); }
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                      />
                      <Button type="button" size="sm" onClick={() => { const v = renameValue.trim(); if (v) rename.mutate({ id: d.id, fileName: v }); setRenamingId(null); }}>Save</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setRenamingId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 truncate text-sm font-medium" title={d.fileName}>{d.fileName}</span>
                      <Badge variant={approved ? 'success' : submitted ? 'secondary' : 'outline'} className="shrink-0">
                        {approved ? 'Approved' : submitted ? 'Submitted' : 'Awaiting client'}
                      </Badge>
                      {isPdf(d) && !approved && (d.fields?.length ?? 0) === 0 && (
                        <Badge variant="outline" className="shrink-0 border-amber-500 text-amber-600">Needs fields</Badge>
                      )}
                      {submitted && (
                        <Button type="button" size="sm" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: d.id, status: 'APPROVED' })}>
                          Approve
                        </Button>
                      )}
                      {approved && (
                        <Button type="button" size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: d.id, status: 'SUBMITTED' })}>
                          Revoke
                        </Button>
                      )}
                      <span className="w-16 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{docSize(d.size)}</span>
                      <a href={downloadUrl} download={d.fileName} target="_blank" rel="noreferrer" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-primary" title={d.signedUrl ? 'Download signed copy' : 'Download original'}>
                        <Download className="h-[18px] w-[18px]" />
                      </a>
                      {isPdf(d) && !approved && (
                        <button type="button" onClick={() => setFieldsDoc(d)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-primary" title="Mark fields to fill">
                          <SquarePen className="h-[18px] w-[18px]" />
                        </button>
                      )}
                      <button type="button" onClick={() => { setRenamingId(d.id); setRenameValue(d.fileName); }} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-primary" title="Rename">
                        <Pencil className="h-[18px] w-[18px]" />
                      </button>
                      <button type="button" onClick={() => remove.mutate(d.id)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-destructive" title="Delete">
                        <Trash2 className="h-[18px] w-[18px]" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
    {fieldsDoc && (
      <AgreementFieldsDialog
        document={fieldsDoc}
        open={!!fieldsDoc}
        onOpenChange={(o) => { if (!o) setFieldsDoc(null); }}
        saving={saveFields.isPending}
        onSave={async (fields: AgreementField[]) => { await saveFields.mutateAsync({ id: fieldsDoc.id, fields }); }}
      />
    )}
    </>
  );
}

/** Products & Licences tab — admin assigns and removes products here. */
function ProductsTab({ customer }: { customer: Customer }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  // Editing works on a licence "group" (the products that share one licence key),
  // identified by that key. null = not editing.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_ASSIGN });
  // Products picked in the Assign/Edit form, each with its OWN agreed price.
  // Map of productId -> price (string).
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ key: string; items: CustomerProduct[] } | null>(null);
  // Unit/Hours multiplier (shared across the group). Off by default; when on, the
  // total becomes agreed price × unitHours (+ GST).
  const [unitEnabled, setUnitEnabled] = useState(false);
  const selectedIds = Object.keys(selected);

  // Group the assigned products by their shared licence key so each licence shows
  // as a single row (products assigned together share one key).
  const groups = (() => {
    const map = new Map<string, CustomerProduct[]>();
    for (const cp of customer.customerProducts ?? []) {
      const key = cp.licence?.licenceKey ?? `__${cp.id}`;
      const arr = map.get(key);
      if (arr) arr.push(cp);
      else map.set(key, [cp]);
    }
    return [...map.entries()].map(([key, items]) => ({ key, items }));
  })();

  // Only show the Unit/Hours column when at least one licence has it enabled.
  const showUnitColumn = groups.some((g) => g.items[0]?.unitHoursEnabled);

  const { data: products } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productApi.list({ pageSize: 100, status: 'ACTIVE' }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['customer', customer.clientId] });
  const set = (k: keyof typeof EMPTY_ASSIGN, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Apply GST to a net figure per the selected mode: INCLUSIVE means the agreed
  // price already contains GST (total == net); EXCLUSIVE adds it on top.
  const withGst = (netAmt: number) =>
    form.gstType === 'INCLUSIVE' ? netAmt : netAmt + netAmt * ((Number(form.taxRate) || 0) / 100);

  // When Unit/Hours is on, each agreed price is multiplied by it before GST.
  const unitFactor = unitEnabled ? Number(form.unitHours) || 0 : 1;
  const total = selectedIds.reduce(
    (sum, id) => sum + withGst((Number(selected[id]) || 0) * unitFactor),
    0
  );

  const assign = useMutation({
    mutationFn: () => {
      // Terms other than price are shared across every selected product; the
      // agreed price is per-product. The licence key is only carried through for
      // a single product (many can't share one — each auto-generates its own).
      const shared: Record<string, unknown> = {
        contractType: form.contractType,
        gstType: form.gstType,
        unitHoursEnabled: unitEnabled,
        unitHours: unitEnabled ? Number(form.unitHours) || 0 : 0,
      };
      if (form.taxRate !== '') shared.taxRate = Number(form.taxRate);
      if (form.issueDate) shared.issueDate = form.issueDate;
      if (form.expiryDate) shared.expiryDate = form.expiryDate;
      const products = selectedIds.map((id) => ({
        ...shared,
        productId: id,
        ...(selected[id] !== '' ? { price: Number(selected[id]) } : {}),
        ...(selectedIds.length === 1 && form.licence.trim() ? { licence: form.licence.trim() } : {}),
      }));
      return customerApi.assignProducts(customer.clientId, products);
    },
    onSuccess: () => {
      refresh();
      toast.success(selectedIds.length === 1 ? 'Product assigned' : `${selectedIds.length} products assigned`);
      setForm({ ...EMPTY_ASSIGN });
      setSelected({});
      setUnitEnabled(false);
      setAdding(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  // Save a whole group: the ticked products (with prices) are the desired set —
  // added ones get created, unticked ones removed, all under the shared key.
  const updateGroup = useMutation({
    mutationFn: () => {
      // Always send the price (0 when cleared) so clearing it actually saves —
      // otherwise the backend keeps the previous value.
      const products = selectedIds.map((id) => ({
        productId: id,
        price: Number(selected[id]) || 0,
      }));
      const body: Record<string, unknown> = {
        products,
        contractType: form.contractType,
        gstType: form.gstType,
        unitHoursEnabled: unitEnabled,
        unitHours: unitEnabled ? Number(form.unitHours) || 0 : 0,
      };
      if (form.licence.trim()) body.licenceKey = form.licence.trim();
      if (form.issueDate) body.issueDate = form.issueDate;
      if (form.expiryDate) body.expiryDate = form.expiryDate;
      return customerApi.updateProductGroup(customer.clientId, editingKey!, body);
    },
    onSuccess: () => {
      refresh();
      toast.success('Products updated');
      setForm({ ...EMPTY_ASSIGN });
      setSelected({});
      setUnitEnabled(false);
      setEditingKey(null);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  function startEditGroup(group: { key: string; items: CustomerProduct[] }) {
    const rep = group.items[0];
    setAdding(false);
    setEditingKey(group.key);
    setSelected(
      Object.fromEntries(group.items.map((cp) => [cp.product.id, cp.price != null ? String(cp.price) : '']))
    );
    setUnitEnabled(rep.unitHoursEnabled ?? false);
    setForm({
      productId: '',
      price: '',
      unitHours: rep.unitHours != null ? String(rep.unitHours) : '',
      taxRate: '10', // GST — fixed at 10%
      contractType: rep.contractType ?? 'LOCKED',
      gstType: rep.gstType ?? 'EXCLUSIVE',
      licence: rep.licence?.licenceKey ?? '',
      issueDate: rep.issueDate ? rep.issueDate.slice(0, 10) : '',
      expiryDate: rep.expiryDate ? rep.expiryDate.slice(0, 10) : '',
    });
  }
  function cancelForm() {
    setAdding(false);
    setEditingKey(null);
    setForm({ ...EMPTY_ASSIGN });
    setSelected({});
    setUnitEnabled(false);
  }
  const toggleProduct = (id: string) =>
    setSelected((s) => {
      if (id in s) {
        const { [id]: _drop, ...rest } = s;
        void _drop;
        return rest;
      }
      return { ...s, [id]: '' };
    });
  const setProductPrice = (id: string, price: string) =>
    setSelected((s) => ({ ...s, [id]: price }));

  // Status / approve / remove act on the whole licence group at once.
  const setStatus = useMutation({
    mutationFn: (v: { items: CustomerProduct[]; status: 'ACTIVE' | 'SUSPENDED' }) =>
      Promise.all(v.items.map((cp) => customerApi.updateProduct(customer.clientId, cp.id, { status: v.status }))),
    onSuccess: () => { refresh(); toast.success('Status updated'); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const approve = useMutation({
    mutationFn: (items: CustomerProduct[]) =>
      Promise.all(
        items.map((cp) => customerApi.updateProduct(customer.clientId, cp.id, { approvalStatus: 'APPROVED', status: 'ACTIVE' }))
      ),
    onSuccess: () => { refresh(); toast.success('Products approved'); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (key: string) => customerApi.removeProductGroup(customer.clientId, key),
    onSuccess: () => { refresh(); toast.success('Products removed'); setRemoving(null); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Products & Licences</CardTitle>
        {!adding && !editingKey && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Assign Product
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {(adding || editingKey) && (
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label={`Products${selectedIds.length ? ` (${selectedIds.length} selected)` : ''}`}>
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-input bg-background p-2">
                    {!products?.items.length ? (
                      <p className="px-1 py-2 text-sm text-muted-foreground">No active products available.</p>
                    ) : (
                      products.items.map((p) => {
                        const picked = p.id in selected;
                        return (
                          <div
                            key={p.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/60"
                          >
                            <label className="flex flex-1 cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-input accent-primary"
                                checked={picked}
                                onChange={() => toggleProduct(p.id)}
                              />
                              <span className="flex-1">{p.name}</span>
                              <span className="text-xs text-muted-foreground">{p.sku ?? p.productCode}</span>
                            </label>
                            {picked && (
                              <div className="flex shrink-0 items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">Agreed Price</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={selected[p.id]}
                                  onChange={(e) => setProductPrice(p.id, e.target.value)}
                                  placeholder="0.00"
                                  className="h-8 w-28"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {editingKey
                      ? 'Tick to add products to this licence, untick to remove — all share the one licence key below.'
                      : 'Tick products and set each one’s agreed price — the other terms below apply to all selected.'}
                  </p>
                </Field>
              </div>
              <Field
                label={
                  <span className="flex items-center justify-between gap-2">
                    <span>Unit/Hours</span>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-normal text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-input accent-primary"
                        checked={unitEnabled}
                        onChange={(e) => setUnitEnabled(e.target.checked)}
                      />
                      Enable
                    </label>
                  </span>
                }
              >
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={unitEnabled ? 'e.g. 10' : 'Disabled'}
                  value={unitEnabled ? form.unitHours : ''}
                  disabled={!unitEnabled}
                  onChange={(e) => set('unitHours', e.target.value)}
                />
              </Field>
              <Field label="Tax Rate (%)">
                <div title="GST is fixed at 10%" className="flex h-10 items-center rounded-md border border-input bg-secondary/40 px-3 text-sm font-medium text-foreground">
                  {form.taxRate}%
                </div>
              </Field>
              <Field label="Type of Contract">
                <Select value={form.contractType} onChange={(e) => set('contractType', e.target.value)}>
                  <option value="LOCKED">Locked</option>
                  <option value="TRIAL">Trial</option>
                </Select>
              </Field>
              <Field label="GST">
                <Select value={form.gstType} onChange={(e) => set('gstType', e.target.value)}>
                  <option value="EXCLUSIVE">Exclusive</option>
                  <option value="INCLUSIVE">Inclusive</option>
                </Select>
              </Field>
              <Field label="Total Amount">
                <div className="flex h-10 items-center rounded-md border border-input bg-secondary/40 px-3 text-sm font-medium">
                  {formatCurrency(total)}
                </div>
              </Field>
              <Field label={editingKey ? 'Licence Key (shared)' : 'Licence Key'}>
                <Input
                  placeholder={editingKey ? '' : 'Auto-generated (shared)'}
                  value={form.licence}
                  onChange={(e) => set('licence', e.target.value)}
                />
              </Field>
              <Field label="Issue Date">
                <Input type="date" value={form.issueDate} onChange={(e) => set('issueDate', e.target.value)} />
              </Field>
              <Field label="Expiry Date">
                <Input type="date" value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} />
              </Field>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={cancelForm}>
                Cancel
              </Button>
              {editingKey ? (
                <Button size="sm" disabled={!selectedIds.length || updateGroup.isPending} onClick={() => updateGroup.mutate()}>
                  {updateGroup.isPending && <Spinner />} Save changes
                </Button>
              ) : (
                <Button size="sm" disabled={!selectedIds.length || assign.isPending} onClick={() => assign.mutate()}>
                  {assign.isPending && <Spinner />} {selectedIds.length > 1 ? `Assign ${selectedIds.length} products` : 'Assign'}
                </Button>
              )}
            </div>
          </div>
        )}

        {!customer.customerProducts?.length ? (
          <EmptyState title="No products assigned" description="Use “Assign Product” to add one." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table className="min-w-[1040px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Products</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Issued</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Expiry</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Days Left</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Agreed Amount</TableHead>
                  {showUnitColumn && <TableHead className="whitespace-nowrap text-center">Unit/Hours</TableHead>}
                  <TableHead className="whitespace-nowrap text-center">Contract</TableHead>
                  <TableHead className="whitespace-nowrap text-center">GST</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Total Amount</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => {
                  const rep = group.items[0];
                  const pending = group.items.some((it) => it.approvalStatus === 'PENDING');
                  // Unit/Hours (shared across the group) multiplies each agreed price
                  // before GST when enabled. Total = base(+GST) summed over products.
                  const gu = rep.unitHoursEnabled ? Number(rep.unitHours) || 0 : 1;
                  const total = group.items.reduce((s, it) => {
                    const base = (Number(it.price) || 0) * gu;
                    const rate = Number(it.taxRate ?? 10) || 0;
                    const gst = (it.gstType ?? 'EXCLUSIVE') === 'INCLUSIVE' ? 0 : base * (rate / 100);
                    return s + base + gst;
                  }, 0);
                  return (
                    <TableRow key={group.key}>
                      <TableCell className="align-top">
                        <div className="space-y-1">
                          {group.items.map((it) => (
                            <div key={it.id}>
                              <span className="font-medium">{it.product.name}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{it.product.sku ?? it.product.productCode}</span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center text-sm align-top">{formatDate(rep.issueDate)}</TableCell>
                      <TableCell className="whitespace-nowrap text-center text-sm align-top">{formatDate(rep.expiryDate)}</TableCell>
                      <TableCell className="text-center text-sm tabular-nums align-top">{daysLeftFromToday(rep.expiryDate)}</TableCell>
                      <TableCell className="whitespace-nowrap text-center text-sm font-medium tabular-nums align-top">
                        <div className="space-y-1">
                          {group.items.map((it) => (
                            <div key={it.id}>{formatCurrency(it.price)}</div>
                          ))}
                        </div>
                      </TableCell>
                      {showUnitColumn && (
                        <TableCell className="whitespace-nowrap text-center text-sm tabular-nums align-top">
                          {rep.unitHoursEnabled ? (Number(rep.unitHours) || 0) : '—'}
                        </TableCell>
                      )}
                      <TableCell className="whitespace-nowrap text-center text-sm capitalize align-top">{(rep.contractType ?? 'LOCKED').toLowerCase()}</TableCell>
                      <TableCell className="whitespace-nowrap text-center text-sm capitalize align-top">{(rep.gstType ?? 'EXCLUSIVE').toLowerCase()}</TableCell>
                      <TableCell className="whitespace-nowrap text-center text-sm font-medium tabular-nums align-top">{formatCurrency(total)}</TableCell>
                      <TableCell className="whitespace-nowrap text-center align-top">
                        {pending ? (
                          /* Client added this — approve it, then the status
                             dropdown (below) controls what the client sees. */
                          <div className="flex flex-col items-center gap-1.5">
                            <Badge variant="warning">Pending approval</Badge>
                            <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(group.items)}>
                              {approve.isPending && <Spinner />} Approve
                            </Button>
                          </div>
                        ) : (
                          /* Admin sets the status here; the client sees exactly this. */
                          <Select
                            value={rep.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'}
                            onChange={(e) => setStatus.mutate({ items: group.items, status: e.target.value as 'ACTIVE' | 'SUSPENDED' })}
                            className="mx-auto h-9 w-40"
                          >
                            <option value="ACTIVE">Active</option>
                            <option value="SUSPENDED">Suspended - Overdue</option>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center align-top">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewing(group)}
                            title="View full details"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditGroup(group)}
                            title="Edit this licence (add/remove products, prices)"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoving(group.key)}
                            title="Remove this licence (all its products)"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title="Remove this licence?"
        description="This removes the licence and every product assigned under it from the customer."
        confirmLabel="Remove"
        destructive
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />

      <LicenceGroupDetailsDialog group={viewing} onOpenChange={(v) => !v && setViewing(null)} />
    </Card>
  );
}

/** Read-only full details of a licence group — everything the table columns omit. */
function LicenceGroupDetailsDialog({
  group,
  onOpenChange,
}: {
  group: { key: string; items: CustomerProduct[] } | null;
  onOpenChange: (v: boolean) => void;
}) {
  const rep = group?.items[0];
  const unitOn = !!rep?.unitHoursEnabled;
  const unitVal = unitOn ? Number(rep?.unitHours) || 0 : 1;
  const lineTotals = (cp: CustomerProduct) => {
    const net = (Number(cp.price) || 0) * unitVal;
    const rate = Number(cp.taxRate ?? 10) || 0;
    const gst = cp.gstType === 'INCLUSIVE' ? 0 : net * (rate / 100);
    return { net, gst, total: net + gst };
  };
  const totals = (group?.items ?? []).reduce(
    (acc, cp) => {
      const { net, gst, total } = lineTotals(cp);
      return { net: acc.net + net, gst: acc.gst + gst, total: acc.total + total };
    },
    { net: 0, gst: 0, total: 0 }
  );

  return (
    <Dialog open={!!group} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Licence details</DialogTitle>
          <DialogDescription>Full details of this licence and its products.</DialogDescription>
        </DialogHeader>
        {rep && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Detail label="Licence Key" value={<span className="font-mono tracking-wide">{rep.licence?.licenceKey ?? '—'}</span>} />
              <Detail label="Status" value={<span className="capitalize">{(rep.status ?? 'ACTIVE').replace(/_/g, ' ').toLowerCase()}</span>} />
              <Detail label="Contract" value={<span className="capitalize">{(rep.contractType ?? 'LOCKED').toLowerCase()}</span>} />
              <Detail label="GST" value={<span className="capitalize">{(rep.gstType ?? 'EXCLUSIVE').toLowerCase()}</span>} />
              <Detail label="Unit/Hours" value={unitOn ? String(unitVal) : 'Off'} />
              <Detail label="Issued" value={formatDate(rep.issueDate)} />
              <Detail label="Expiry" value={formatDate(rep.expiryDate)} />
              <Detail label="Days Left" value={String(daysLeftFromToday(rep.expiryDate))} />
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Agreed Price</th>
                    <th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2 text-right">GST</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((cp) => {
                    const { net, gst, total } = lineTotals(cp);
                    return (
                      <tr key={cp.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <p className="font-medium">{cp.product.name}</p>
                          <p className="text-xs text-muted-foreground">{cp.product.sku ?? cp.product.productCode}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(cp.price)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(net)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(gst)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-border bg-secondary/30 font-medium">
                  <tr>
                    <td className="px-3 py-2" colSpan={2}>Totals</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.net)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.gst)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
