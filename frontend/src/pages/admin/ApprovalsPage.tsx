import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, ShieldCheck, Search, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi, type PendingUser, type ApprovalStatus } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader, Pagination } from '@/components/shared/misc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton, Avatar, AvatarFallback } from '@/components/ui/misc';
import { EmptyState, ErrorState, Spinner } from '@/components/shared/states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { formatDate, initials } from '@/lib/utils';

const ROLE_BADGE: Record<string, { label: string; variant: 'default' | 'warning' | 'secondary' }> = {
  CLIENT: { label: 'Client', variant: 'default' },
  SUPPLIER: { label: 'Supplier', variant: 'warning' },
  EMPLOYEE: { label: 'Employee', variant: 'secondary' },
};

// Per-role avatar gradient — matches the portal accent colours.
const ROLE_GRADIENT: Record<string, string> = {
  CLIENT: 'from-[#0d9488] to-[#10b981]',
  SUPPLIER: 'from-[#ea580c] to-[#f59e0b]',
  EMPLOYEE: 'from-[#0284c7] to-[#38bdf8]',
};

const STATUS_BADGE: Record<ApprovalStatus, { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  APPROVED: { label: 'Approved', variant: 'success' },
  PENDING: { label: 'Pending', variant: 'warning' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
};

const TABS: Array<{ value: string; label: string; status?: ApprovalStatus }> = [
  { value: 'PENDING', label: 'Pending', status: 'PENDING' },
  { value: 'APPROVED', label: 'Approved', status: 'APPROVED' },
  { value: 'REJECTED', label: 'Rejected', status: 'REJECTED' },
  { value: 'ALL', label: 'All' },
];

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<{ user: PendingUser; action: 'reject' } | null>(null);
  const debounced = useDebounce(search);

  const status = TABS.find((t) => t.value === tab)?.status;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'registrations', { page, debounced, status, role }],
    queryFn: () =>
      adminApi.registrations({ page, pageSize: 10, search: debounced, status, role }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'registrations'] });
    qc.invalidateQueries({ queryKey: ['admin', 'pendingCount'] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => adminApi.approve(id),
    onSuccess: () => {
      invalidate();
      toast.success('Account approved — the user can now sign in');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => adminApi.reject(id),
    onSuccess: () => {
      invalidate();
      toast.success('Access revoked');
      setConfirm(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const counts = data?.meta.counts;
  const filtered = !!(debounced || role);
  const clearFilters = () => {
    setSearch('');
    setRole('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registration Approvals"
        description="Review Client, Supplier and Employee sign-up requests, and manage access after the fact"
      />

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          setPage(1);
        }}
      >
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              {counts && t.status && counts[t.status] > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] font-semibold tabular-nums">
                  {counts[t.status]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name or email…"
              className="pl-9"
            />
          </div>
          <Select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            className="sm:w-44"
          >
            <option value="">All portals</option>
            <option value="CLIENT">Client</option>
            <option value="SUPPLIER">Supplier</option>
            <option value="EMPLOYEE">Employee</option>
          </Select>
        </div>

        {tab === 'PENDING' && !!counts?.PENDING && (
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
            </span>
            <p className="text-sm font-medium">
              {counts.PENDING} {counts.PENDING === 1 ? 'request' : 'requests'} awaiting review
            </p>
          </div>
        )}

        {isError ? (
          <div className="p-6">
            <ErrorState onRetry={refetch} />
          </div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <div className="p-6">
            <EmptyState
              icon={<ShieldCheck className="h-6 w-6" />}
              title={filtered ? 'No matching requests' : 'Nothing here'}
              description={
                filtered
                  ? 'No request matches this search or portal filter.'
                  : tab === 'PENDING'
                    ? 'New sign-up requests will appear here for approval.'
                    : `No ${tab.toLowerCase()} requests yet.`
              }
              action={
                filtered ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Portal</TableHead>
                  <TableHead>Client ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((u) => {
                  const badge = ROLE_BADGE[u.role];
                  const st = STATUS_BADGE[u.approvalStatus];
                  const busy =
                    (approve.isPending && approve.variables === u.id) ||
                    (rejectMut.isPending && rejectMut.variables === u.id);
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback
                              className={`bg-gradient-to-br ${ROLE_GRADIENT[u.role] ?? 'from-primary to-[#34B98C]'} text-xs font-semibold text-white`}
                            >
                              {initials(u.firstName, u.lastName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {u.firstName} {u.lastName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {u.customer?.clientId ? (
                          <span className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                            {u.customer.clientId}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(u.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {u.approvalStatus === 'PENDING' && (
                            <>
                              <Button size="sm" disabled={busy} onClick={() => approve.mutate(u.id)}>
                                {busy ? (
                                  <Spinner className="text-primary-foreground" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => setConfirm({ user: u, action: 'reject' })}
                              >
                                <X className="h-4 w-4" /> Reject
                              </Button>
                            </>
                          )}
                          {u.approvalStatus === 'APPROVED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => setConfirm({ user: u, action: 'reject' })}
                            >
                              <X className="h-4 w-4" /> Revoke access
                            </Button>
                          )}
                          {u.approvalStatus === 'REJECTED' && (
                            <Button size="sm" disabled={busy} onClick={() => approve.mutate(u.id)}>
                              {busy ? (
                                <Spinner className="text-primary-foreground" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                              Re-approve
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={
          confirm?.user.approvalStatus === 'APPROVED' ? 'Revoke access?' : 'Reject this request?'
        }
        description={
          confirm?.user.approvalStatus === 'APPROVED'
            ? `${confirm.user.firstName} ${confirm.user.lastName} (${confirm.user.email}) will be signed out of the ${ROLE_BADGE[confirm.user.role].label.toLowerCase()} portal and blocked from signing in again. You can re-approve them later.`
            : `${confirm?.user.firstName} ${confirm?.user.lastName} (${confirm?.user.email}) will not be able to sign in. You can re-approve them later.`
        }
        confirmLabel={confirm?.user.approvalStatus === 'APPROVED' ? 'Revoke access' : 'Reject'}
        destructive
        loading={rejectMut.isPending}
        onConfirm={() => confirm && rejectMut.mutate(confirm.user.id)}
      />
    </div>
  );
}
