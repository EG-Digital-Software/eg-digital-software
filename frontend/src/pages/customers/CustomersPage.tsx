import { useState } from 'react';
import { useStaffAccess } from '@/lib/staffAccess';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, MoreHorizontal, Eye, Pencil, Archive, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { customerApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import type { Customer } from '@/types';
import { useDebounce } from '@/hooks/useDebounce';
import { Pagination } from '@/components/shared/misc';
import { Skeleton } from '@/components/ui/misc';
import { AVATAR_COLORS, initialsOf } from '@/components/client/portalContext';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BUSINESS_TYPES, businessTypesLabel, customerName } from '@/lib/customer';
import { Flag } from '@/components/shared/PhoneInput';
import { countryCodeByName } from '@/lib/countries';

const ACCOUNT_STATUS: Record<
  NonNullable<Customer['accountStatusEffective']>,
  { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' }
> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  ACTIVE_TRIAL: { label: 'Active-Trial', variant: 'default' },
  DORMANT: { label: 'Dormant', variant: 'warning' },
  SUSPENDED: { label: 'Suspended', variant: 'destructive' },
};

const STATUS_FILTERS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ACTIVE_TRIAL', label: 'Active-Trial' },
  { value: 'DORMANT', label: 'Dormant' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'ARCHIVED', label: 'Archived' },
];

/** Badge variant → design chip class. */
const CHIP: Record<string, string> = {
  success: 'c-ok',
  default: 'c-on',
  warning: 'c-warn',
  destructive: 'c-red',
  muted: 'c-ns',
};

function invoiceSummary(c: Customer): { label: string; variant: 'success' | 'warning' | 'muted' } {
  const invs = c.invoices ?? [];
  if (!invs.length) return { label: 'No invoices', variant: 'muted' };
  const outstanding = invs.filter((i) => Number(i.total) > Number(i.amountPaid)).length;
  return outstanding
    ? { label: `${outstanding} outstanding`, variant: 'warning' }
    : { label: 'Paid', variant: 'success' };
}

/** Principal address is the customer's real-world location; fall back to billing. */
function location(c: Customer) {
  const a =
    c.addresses?.find((x) => x.type === 'PRINCIPAL') ??
    c.addresses?.find((x) => x.type === 'BILLING');
  if (!a?.city && !a?.country) return null;
  return { city: a?.city ?? '', country: a?.country ?? '', code: countryCodeByName(a?.country) };
}

export default function CustomersPage() {
  // Editing a customer's details and permanent delete are admin-only, even for
  // team members with the Customers tab.
  const { isAdmin } = useStaffAccess();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [businessType, setBusinessType] = useState('');
  const [archiving, setArchiving] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  // Short debounce so results refresh almost as fast as the operator types,
  // while still collapsing a burst of keystrokes into one request.
  const debounced = useDebounce(search, 200);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', { page, debounced, status, businessType }],
    queryFn: () =>
      customerApi.list({
        page,
        pageSize: 10,
        search: debounced,
        status,
        sortBy: 'clientId',
        sortDir: 'asc',
        ...(businessType ? { businessType } : {}),
      }),
  });

  const archive = useMutation({
    mutationFn: (clientId: string) => customerApi.archive(clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer archived');
      setArchiving(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (clientId: string) => customerApi.remove(clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Customer permanently deleted');
      setDeleting(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const items = data?.items ?? [];
  const withOutstanding = items.filter((c) => invoiceSummary(c).variant === 'warning').length;
  const statusLabel = STATUS_FILTERS.find((f) => f.value === status)?.label ?? 'Active';
  const filtered = !!(debounced || businessType || status !== 'ACTIVE');
  const typeLabel = BUSINESS_TYPES.find((t) => t.value === businessType)?.label;
  const clearFilters = () => {
    setSearch('');
    setBusinessType('');
    setStatus('ACTIVE');
    setPage(1);
  };

  return (
    <div className="ec-page">
      <div className="up" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
        <div>
          <div className="eyebrow">Customers</div>
          <h1 className="disp ec-h1">Customers</h1>
          <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
            Manage your clients, products and licences.
          </p>
        </div>
        <Link to="/admin/customers/new" className="btn bp">
          <Plus /> New customer
        </Link>
      </div>

      <div className="stag" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div className="glass card" style={{ padding: 16 }}>
          <div className="eyebrow">{statusLabel} customers</div>
          <div className="disp stat" style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>
            {isLoading ? '–' : (data?.meta.total ?? 0)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>{filtered ? 'Matching the current filters' : 'All active accounts'}</div>
        </div>
        <div className="glass card" style={{ padding: 16 }}>
          <div className="eyebrow">Outstanding invoices</div>
          <div
            className="disp stat"
            style={{ fontSize: 28, fontWeight: 700, marginTop: 6, color: withOutstanding ? 'var(--wT)' : undefined }}
          >
            {isLoading ? '–' : withOutstanding}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Customers on this page with unpaid invoices</div>
        </div>
        <div className="glass card" style={{ padding: 16 }}>
          <div className="eyebrow">Business type</div>
          <div className="disp" style={{ fontSize: 20, fontWeight: 600, marginTop: 10 }}>
            {typeLabel ?? 'All types'}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Sorted by Customer ID</div>
        </div>
      </div>

      <section className="glass up" style={{ overflow: 'hidden', animationDelay: '.1s' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            padding: '14px 16px',
            borderBottom: '1px solid rgba(var(--w),.06)',
          }}
        >
          <div className="segs" role="group" aria-label="Account status">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`seg${status === f.value ? ' on' : ''}`}
                aria-pressed={status === f.value}
                onClick={() => {
                  setStatus(f.value);
                  setPage(1);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', flex: '1 1 260px', position: 'relative' }}>
            <span className="sr">Search customers</span>
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4" style={{ color: 'var(--mu)' }} />
            <input
              className="inp"
              style={{ paddingLeft: 38 }}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, business, email, ABN, contact or Customer ID…"
            />
          </label>
          <label style={{ display: 'flex', flex: '0 1 220px' }}>
            <span className="sr">Business type</span>
            <select
              className="inp"
              value={businessType}
              onChange={(e) => {
                setBusinessType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All business types</option>
              {BUSINESS_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {data?.meta && (
            <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              {data.meta.total} {data.meta.total === 1 ? 'customer' : 'customers'}
            </span>
          )}
        </div>

        {isError ? (
          <div className="p-6">
            <ErrorState onRetry={refetch} />
          </div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data || !items.length ? (
          <div className="p-6">
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title="No customers found"
              description={
                filtered
                  ? 'No customer matches these filters. Try clearing the search, business type or status.'
                  : 'Add your first customer to start managing clients.'
              }
              action={
                filtered ? (
                  <button type="button" className="btn bg" onClick={clearFilters}>
                    Clear filters
                  </button>
                ) : (
                  <Link to="/admin/customers/new" className="btn bp">
                    <Plus /> New customer
                  </Link>
                )
              }
            />
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Customer ID</th>
                    <th>Business</th>
                    <th>City</th>
                    <th>Country</th>
                    <th>Invoices</th>
                    <th>Account status</th>
                    <th>
                      <span className="sr">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="stag">
                  {items.map((c, i) => {
                    const inv = invoiceSummary(c);
                    const loc = location(c);
                    const s = ACCOUNT_STATUS[c.accountStatusEffective ?? c.accountStatus];
                    return (
                      <tr key={c.id} className="row click" onClick={() => navigate(`/admin/customers/${c.clientId}`)}>
                        <td className="mono" style={{ fontSize: 12, color: 'var(--mu)' }}>
                          {c.clientId}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                            <span
                              className="av"
                              style={{
                                width: 36,
                                height: 36,
                                fontSize: 12,
                                margin: 0,
                                background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                              }}
                            >
                              {initialsOf(c.companyName || customerName(c))}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div className="truncate" style={{ fontWeight: 600 }}>
                                {c.companyName || '—'}
                              </div>
                              {c.tradingAs && c.tradingAs !== c.companyName && (
                                <div className="muted truncate" style={{ fontSize: 12 }}>
                                  T/A {c.tradingAs}
                                </div>
                              )}
                              {c.businessType && (
                                <span className="chip c-ns" style={{ marginTop: 4, padding: '1px 8px', fontSize: 11 }}>
                                  {businessTypesLabel(c.businessType)}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="nw">{loc?.city || <span className="muted">—</span>}</td>
                        <td className="nw">
                          {loc?.country ? (
                            <span className="flex items-center gap-1.5">
                              <Flag code={loc.code} />
                              <span className="truncate">{loc.country}</span>
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`chip ${CHIP[inv.variant]}`}>
                            <span className="dot" />
                            {inv.label}
                          </span>
                        </td>
                        <td>
                          <span className={`chip ${CHIP[s.variant]}`}>
                            <span className="dot" />
                            {s.label}
                          </span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className="btn bg"
                              style={{ width: 36, minHeight: 36, padding: 0 }}
                              aria-label="Customer actions"
                            >
                              <MoreHorizontal />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/admin/customers/${c.clientId}`)}>
                                <Eye /> View
                              </DropdownMenuItem>
                              {isAdmin && (
                                <DropdownMenuItem onClick={() => navigate(`/admin/customers/${c.clientId}/edit`)}>
                                  <Pencil /> Edit
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem destructive onClick={() => setArchiving(c)}>
                                <Archive /> Archive
                              </DropdownMenuItem>
                              {isAdmin && (
                                <DropdownMenuItem destructive onClick={() => setDeleting(c)}>
                                  <Trash2 /> Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </section>

      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(v) => !v && setArchiving(null)}
        title="Archive Customer?"
        description={`${archiving ? customerName(archiving) : ''} will be archived. Their invoices and records are preserved.`}
        confirmLabel="Archive"
        destructive
        loading={archive.isPending}
        onConfirm={() => archiving && archive.mutate(archiving.clientId)}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete Customer Permanently?"
        description={`${deleting ? customerName(deleting) : ''} and all its data — addresses, directors and assigned products — will be permanently deleted. This cannot be undone. A customer with invoices can't be deleted; archive it instead.`}
        confirmLabel="Delete permanently"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.clientId)}
      />
    </div>
  );
}
