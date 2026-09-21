import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, ShieldCheck, Search, RotateCcw, UserPlus, KeyRound, Eye, EyeOff, Copy, Users, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi, settingsApi, type PendingUser, type ApprovalStatus } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader, Pagination } from '@/components/shared/misc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton, Avatar, AvatarFallback } from '@/components/ui/misc';
import { EmptyState, ErrorState, Spinner } from '@/components/shared/states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { formatDate, initials } from '@/lib/utils';

const ROLE_BADGE: Record<string, { label: string; variant: 'default' | 'warning' | 'secondary' }> = {
  CLIENT: { label: 'Customer', variant: 'default' },
  SUPPLIER: { label: 'Supplier', variant: 'warning' },
  EMPLOYEE: { label: 'Team', variant: 'secondary' },
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
  // Arriving via "Manage Team" (?role=EMPLOYEE) opens pre-filtered to team,
  // showing every status (not just pending) so all team members are listed.
  const [searchParams] = useSearchParams();
  const initialRole = searchParams.get('role') ?? '';
  const [tab, setTab] = useState(initialRole ? 'ALL' : 'PENDING');
  const [page, setPage] = useState(1);
  const [role, setRole] = useState(initialRole);
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<{ user: PendingUser; action: 'reject' | 'delete' } | null>(
    null
  );
  const [addOpen, setAddOpen] = useState(false);
  const [managePw, setManagePw] = useState<PendingUser | null>(null);
  const [editEmp, setEditEmp] = useState<PendingUser | null>(null);
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

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteRegistration(id),
    onSuccess: () => {
      invalidate();
      toast.success('Account deleted');
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
        description="Review Customer and Team sign-up requests, and manage access after the fact"
        icon={ShieldCheck}
        iconTone="amber"
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" /> Add Employee
          </Button>
        }
      />

      <GlobalAccountManagerCard />

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
            <option value="CLIENT">Customer</option>
            <option value="EMPLOYEE">Team</option>
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
                  <TableHead>Customer ID</TableHead>
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
                            {u.designation && (
                              <p className="truncate text-xs font-medium text-sky-600">{u.designation}</p>
                            )}
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
                          {u.role === 'EMPLOYEE' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditEmp(u)}
                                title="Edit this team member's profile"
                              >
                                <Pencil className="h-4 w-4" /> Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setManagePw(u)}
                                title="View or reset this team member's password"
                              >
                                <KeyRound className="h-4 w-4" /> Password
                              </Button>
                            </>
                          )}
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
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setConfirm({ user: u, action: 'delete' })}
                            title="Permanently delete this account"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
          confirm?.action === 'delete'
            ? 'Delete this account?'
            : confirm?.user.approvalStatus === 'APPROVED'
              ? 'Revoke access?'
              : 'Reject this request?'
        }
        description={
          confirm?.action === 'delete'
            ? `${confirm.user.firstName} ${confirm.user.lastName} (${confirm.user.email}) will be permanently deleted and can never sign in again. This cannot be undone.${
                confirm.user.role === 'CLIENT'
                  ? ' Their company record, invoices and products are kept — only the login is removed.'
                  : ''
              }`
            : confirm?.user.approvalStatus === 'APPROVED'
              ? `${confirm.user.firstName} ${confirm.user.lastName} (${confirm.user.email}) will be signed out of the ${ROLE_BADGE[confirm.user.role].label.toLowerCase()} portal and blocked from signing in again. You can re-approve them later.`
              : `${confirm?.user.firstName} ${confirm?.user.lastName} (${confirm?.user.email}) will not be able to sign in. You can re-approve them later.`
        }
        confirmLabel={
          confirm?.action === 'delete'
            ? 'Delete permanently'
            : confirm?.user.approvalStatus === 'APPROVED'
              ? 'Revoke access'
              : 'Reject'
        }
        destructive
        loading={confirm?.action === 'delete' ? deleteMut.isPending : rejectMut.isPending}
        onConfirm={() =>
          confirm &&
          (confirm.action === 'delete'
            ? deleteMut.mutate(confirm.user.id)
            : rejectMut.mutate(confirm.user.id))
        }
      />

      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} onDone={invalidate} />
      <EditEmployeeDialog user={editEmp} onOpenChange={(v) => !v && setEditEmp(null)} onDone={invalidate} />
      <ManageEmployeePasswordDialog user={managePw} onOpenChange={(v) => !v && setManagePw(null)} />
    </div>
  );
}

/**
 * Single, global account manager shown to every client in their portal. Set
 * once here (not per-customer) — every customer shares the same manager.
 */
function GlobalAccountManagerCard() {
  const qc = useQueryClient();
  const { data: setting } = useQuery({
    queryKey: ['admin', 'account-manager'],
    queryFn: settingsApi.getAccountManager,
  });
  const { data: emps } = useQuery({
    queryKey: ['employees', 'approved'],
    queryFn: () => adminApi.registrations({ role: 'EMPLOYEE', status: 'APPROVED', pageSize: 100 }),
  });
  const employees = emps?.items ?? [];
  const currentId = setting?.employeeId ?? '';
  const current = employees.find((e) => e.id === currentId) ?? null;

  const save = useMutation({
    mutationFn: (employeeId: string) => settingsApi.setAccountManager(employeeId || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'account-manager'] });
      qc.invalidateQueries({ queryKey: ['client', 'profile'] });
      toast.success('Account manager updated');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Card>
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium">Account Manager</p>
            <p className="text-xs text-muted-foreground">
              {current
                ? `${current.firstName} ${current.lastName} · ${current.email}`
                : 'Assign one team member — shown to every client in their portal'}
            </p>
          </div>
        </div>
        <Select
          value={currentId}
          disabled={save.isPending}
          onChange={(e) => save.mutate(e.target.value)}
          className="sm:w-64"
        >
          <option value="">— Not assigned —</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.firstName} {emp.lastName}
            </option>
          ))}
        </Select>
      </div>
    </Card>
  );
}

/** Admin creates a team login: name, email, role/designation and a password. */
function AddEmployeeDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const empty = { firstName: '', lastName: '', email: '', designation: '', password: '' };
  const [form, setForm] = useState({ ...empty });
  const [showPw, setShowPw] = useState(false);
  const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () =>
      adminApi.createEmployee({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        email: form.email.trim(),
        designation: form.designation.trim() || undefined,
        password: form.password,
      }),
    onSuccess: () => {
      toast.success('Team member added — they can sign in now');
      onDone();
      setForm({ ...empty });
      setShowPw(false);
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const valid = form.firstName.trim() && form.email.trim() && form.password.length >= 8;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setForm({ ...empty });
          setShowPw(false);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>
            Creates an approved Team (Employee) login. You can reveal or reset the password later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>First name</Label>
            <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="Jane" />
          </div>
          <div className="space-y-1.5">
            <Label>Last name</Label>
            <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Doe" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Email</Label>
            <Input
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="jane@company.com"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Role / Designation</Label>
            <Input
              value={form.designation}
              onChange={(e) => set('designation', e.target.value)}
              placeholder="e.g. Accountant, Support Lead"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Password</Label>
            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder="At least 8 characters"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {create.isPending && <Spinner />} Add Employee
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Admin edits a team member's profile: name, login email, designation, phone. */
function EditEmployeeDialog({
  user,
  onOpenChange,
  onDone,
}: {
  user: PendingUser | null;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', designation: '', phone: '' });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Prefill from the selected member whenever the dialog opens for a new one.
  useEffect(() => {
    if (user) {
      setForm({
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        email: user.email ?? '',
        designation: user.designation ?? '',
        phone: user.phone ?? '',
      });
    }
  }, [user]);

  const save = useMutation({
    mutationFn: () =>
      adminApi.updateEmployee(user!.id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        designation: form.designation.trim(),
        phone: form.phone.trim(),
      }),
    onSuccess: () => {
      toast.success('Team member updated');
      onDone();
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const valid = form.firstName.trim() && form.email.trim();

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Team Member</DialogTitle>
          <DialogDescription>Update this team member's profile details.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>First name</Label>
            <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="Jane" />
          </div>
          <div className="space-y-1.5">
            <Label>Last name</Label>
            <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Doe" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Email</Label>
            <Input
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="jane@company.com"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Role / Designation</Label>
            <Input
              value={form.designation}
              onChange={(e) => set('designation', e.target.value)}
              placeholder="e.g. Accountant, Support Lead"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Phone</Label>
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="e.g. +61 400 000 000"
            />
            <p className="text-xs text-muted-foreground">
              Shown to clients when this team member is their account manager.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner />} Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Admin reveals the current password of a team login and/or resets it. */
function ManageEmployeePasswordDialog({
  user,
  onOpenChange,
}: {
  user: PendingUser | null;
  onOpenChange: (v: boolean) => void;
}) {
  const [password, setPassword] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [showNew, setShowNew] = useState(false);

  const reset = () => {
    setPassword(null);
    setShow(false);
    setNewPass('');
    setShowNew(false);
  };

  const reveal = useMutation({
    mutationFn: () => adminApi.revealEmployeePassword(user!.id),
    onSuccess: (res) => {
      if (res.available && res.password) {
        setPassword(res.password);
        setShow(true);
      } else {
        toast.info('No stored password to reveal — reset it below to set a new one');
      }
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not reveal the password')),
  });

  const change = useMutation({
    mutationFn: () => adminApi.changeEmployeePassword(user!.id, newPass.trim()),
    onSuccess: () => {
      toast.success('Password updated');
      setPassword(null);
      setShow(false);
      setNewPass('');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not change the password')),
  });

  return (
    <Dialog
      open={!!user}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Team Member Password</DialogTitle>
          <DialogDescription>
            {user ? `${user.firstName} ${user.lastName} · ${user.email}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Current password</Label>
            {password ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
                  {show ? password : '•'.repeat(Math.max(password.length, 8))}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={() => setShow((s) => !s)}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => reveal.mutate()}
                disabled={reveal.isPending}
              >
                {reveal.isPending ? <Spinner /> : <Eye className="h-3.5 w-3.5" />} Reveal password
              </Button>
            )}
          </div>

          <div className="space-y-1.5 border-t border-border pt-4">
            <Label>New password</Label>
            <div className="relative">
              <Input
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="At least 8 characters"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary"
                aria-label={showNew ? 'Hide password' : 'Show password'}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled={newPass.trim().length < 8 || change.isPending} onClick={() => change.mutate()}>
            {change.isPending && <Spinner />} Save password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
