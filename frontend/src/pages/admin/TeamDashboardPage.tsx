import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, KeyRound, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { adminApi, type PendingUser, type TeamRole } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { useAuth } from '@/store/auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/misc';
import { EmptyState } from '@/components/shared/states';
import { initials, mediaUrl, formatDate, formatNumber } from '@/lib/utils';
import { AVATAR_COLORS } from '@/components/client/portalContext';
import { EditEmployeeDialog, ManageEmployeePasswordDialog } from '@/components/team/EmployeeDialogs';
import { AssignRolesDialog, RoleFormDialog } from '@/components/team/TeamRoleDialogs';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { STAFF_TAB_LABEL } from '@/lib/staffAccess';

function Kpi({ title, value, tone }: { title: string; value: string; tone?: string }) {
  return (
    <div className="glass card" style={{ padding: 20 }}>
      <div className="eyebrow">{title}</div>
      <div className="disp stat" style={{ fontSize: 30, fontWeight: 600, marginTop: 10, color: tone }}>
        {value}
      </div>
    </div>
  );
}

export default function TeamDashboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const startImpersonation = useAuth((s) => s.startImpersonation);
  const [editEmp, setEditEmp] = useState<PendingUser | null>(null);
  const [managePw, setManagePw] = useState<PendingUser | null>(null);
  const [assignFor, setAssignFor] = useState<PendingUser | null>(null);
  // undefined = closed, null = new role, a role = editing it.
  const [roleForm, setRoleForm] = useState<TeamRole | null | undefined>(undefined);
  const [deletingRole, setDeletingRole] = useState<TeamRole | null>(null);

  const rolesQ = useQuery({ queryKey: ['team', 'roles'], queryFn: adminApi.teamRoles });
  const roles = rolesQ.data ?? [];
  const refreshRoles = () => qc.invalidateQueries({ queryKey: ['team', 'roles'] });
  const rolesOf = (id: string) => roles.filter((r) => r.memberIds.includes(id));

  const deleteRole = useMutation({
    mutationFn: (id: string) => adminApi.deleteTeamRole(id),
    onSuccess: () => {
      toast.success('Role deleted');
      setDeletingRole(null);
      refreshRoles();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['team', 'employees'],
    queryFn: () => adminApi.registrations({ role: 'EMPLOYEE', status: 'APPROVED', pageSize: 100 }),
  });
  const employees = data?.items ?? [];
  const activeCount = employees.filter((e) => e.isActive).length;

  const viewPortal = useMutation({
    mutationFn: (id: string) => adminApi.impersonateEmployee(id),
    onSuccess: (session) => {
      startImpersonation({
        user: session.user,
        accessToken: session.accessToken,
        meta: { kind: 'employee', label: session.employee.name, returnTo: '/admin/team' },
      });
      // Drop admin-scoped cache so the team portal fetches fresh as the employee.
      qc.clear();
      navigate('/employee/tasks');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <div className="ec-page">
      <div className="up">
        <div className="eyebrow">Team</div>
        <h1 className="disp ec-h1">Team dashboard</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
          Overview of your team, and open any member’s portal to view it as them.
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="portals">Employee portals</TabsTrigger>
        </TabsList>

        {/* ── Overview ─────────────────────────────────── */}
        <TabsContent value="overview">
          <div className="stag" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <Kpi title="Team members" value={isLoading ? '—' : formatNumber(employees.length)} />
            <Kpi title="Active" value={isLoading ? '—' : formatNumber(activeCount)} tone="var(--brand)" />
            <Kpi title="Inactive" value={isLoading ? '—' : formatNumber(employees.length - activeCount)} tone="var(--wT)" />
          </div>

          <section className="glass up" style={{ overflow: 'hidden', marginTop: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                padding: '18px 20px',
              }}
            >
              <div>
                <h2 className="disp" style={{ margin: 0, fontSize: 17 }}>
                  Team members
                </h2>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  Everyone on your team — roles, status, last login and account controls.
                </div>
              </div>
              {!isLoading && <span className="chip c-ns">{employees.length} people</span>}
            </div>
            {isLoading ? (
              <div className="space-y-2" style={{ padding: '0 20px 20px' }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !employees.length ? (
              <div style={{ padding: '0 20px 20px' }}>
                <EmptyState
                  title="No team members yet"
                  description="Approved team members will appear here. Add them from Approvals → Manage Team."
                />
              </div>
            ) : (
              <div className="stag">
                {employees.map((emp, i) => (
                  <div key={emp.id} className="tmrow row">
                    <span
                      className="av"
                      style={{ width: 36, height: 36, fontSize: 12, margin: 0, background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                    >
                      {emp.avatarUrl ? <img src={mediaUrl(emp.avatarUrl)} alt="" /> : initials(emp.firstName, emp.lastName)}
                    </span>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="muted truncate" style={{ fontSize: 12.5 }}>
                        {emp.email}
                      </div>
                    </div>
                    <span className="chip c-ns" style={{ minWidth: 110, justifyContent: 'center' }}>
                      {emp.designation || 'Team member'}
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 120 }}>
                      {rolesOf(emp.id).length ? (
                        rolesOf(emp.id).map((r) => (
                          <span key={r.id} className="chip c-info">
                            <ShieldCheck className="h-3 w-3" /> {r.name}
                          </span>
                        ))
                      ) : (
                        <span className="muted" style={{ fontSize: 12.5 }}>No roles</span>
                      )}
                    </div>
                    <span className={emp.isActive ? 'chip c-ok' : 'chip c-warn'} style={{ minWidth: 86, justifyContent: 'center' }}>
                      <span className="dot" />
                      {emp.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="muted" style={{ fontSize: 12.5, minWidth: 130 }}>
                      Last login {emp.lastLoginAt ? formatDate(emp.lastLoginAt) : 'never'}
                    </span>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn bg sm" onClick={() => setAssignFor(emp)} title="Choose which roles this team member holds">
                        <ShieldCheck /> Roles
                      </button>
                      <button type="button" className="btn bg sm" onClick={() => setEditEmp(emp)} title="Edit this team member's profile">
                        <Pencil /> Edit
                      </button>
                      <button type="button" className="btn bg sm" onClick={() => setManagePw(emp)} title="View or change this team member's password">
                        <KeyRound /> Change password
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        {/* ── Roles ────────────────────────────────────── */}
        <TabsContent value="roles">
          <section className="glass up" style={{ overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                padding: '18px 20px',
              }}
            >
              <div>
                <h2 className="disp" style={{ margin: 0, fontSize: 17 }}>
                  Roles
                </h2>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  Each role grants a set of admin tabs. Team members see and edit only the tabs their roles allow.
                </div>
              </div>
              <button type="button" className="btn bp sm" onClick={() => setRoleForm(null)}>
                <Plus /> New role
              </button>
            </div>
            {rolesQ.isLoading ? (
              <div className="space-y-2" style={{ padding: '0 20px 20px' }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !roles.length ? (
              <div style={{ padding: '0 20px 20px' }}>
                <EmptyState
                  title="No roles yet"
                  description="Create a role, tick the tabs it can access, then assign it to team members from the Overview tab."
                />
              </div>
            ) : (
              <div className="stag">
                {roles.map((r) => (
                  <div key={r.id} className="tmrow row">
                    <span className="av" style={{ width: 36, height: 36, margin: 0, background: 'rgba(var(--w),.08)', color: 'var(--fg)' }}>
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        {r.memberIds.length} {r.memberIds.length === 1 ? 'member' : 'members'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: '2 1 260px' }}>
                      {r.tabs.length ? (
                        r.tabs.map((t) => (
                          <span key={t} className="chip c-ns">
                            {STAFF_TAB_LABEL[t] ?? t}
                          </span>
                        ))
                      ) : (
                        <span className="muted" style={{ fontSize: 12.5 }}>No tabs</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button type="button" className="btn bg sm" onClick={() => setRoleForm(r)}>
                        <Pencil /> Edit
                      </button>
                      <button type="button" className="btn bg sm" onClick={() => setDeletingRole(r)}>
                        <Trash2 /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        {/* ── Employee Portals ─────────────────────────── */}
        <TabsContent value="portals">
          <section className="glass up" style={{ overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                padding: '18px 20px',
              }}
            >
              <div>
                <h2 className="disp" style={{ margin: 0, fontSize: 17 }}>
                  Team members
                </h2>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  Open a member’s portal to view or work in it as them.
                </div>
              </div>
              {!isLoading && <span className="chip c-ns">{employees.length} people</span>}
            </div>
            {isLoading ? (
              <div className="space-y-2" style={{ padding: '0 20px 20px' }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !employees.length ? (
              <div style={{ padding: '0 20px 20px' }}>
                <EmptyState
                  title="No team members yet"
                  description="Approved team members will appear here. Add them from Approvals → Manage Team."
                />
              </div>
            ) : (
              <div className="stag">
                {employees.map((emp, i) => (
                  <div key={emp.id} className="tmrow row">
                    <span
                      className="av"
                      style={{ width: 36, height: 36, fontSize: 12, margin: 0, background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                    >
                      {emp.avatarUrl ? <img src={mediaUrl(emp.avatarUrl)} alt="" /> : initials(emp.firstName, emp.lastName)}
                    </span>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="muted truncate" style={{ fontSize: 12.5 }}>
                        {emp.email}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 130 }}>
                      <button
                        type="button"
                        className="btn bg sm"
                        disabled={viewPortal.isPending}
                        onClick={() => viewPortal.mutate(emp.id)}
                      >
                        <Eye /> View / Edit portal
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>

      <EditEmployeeDialog
        user={editEmp}
        onOpenChange={(v) => !v && setEditEmp(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ['team', 'employees'] })}
      />
      <ManageEmployeePasswordDialog user={managePw} onOpenChange={(v) => !v && setManagePw(null)} />
      <AssignRolesDialog user={assignFor} roles={roles} onOpenChange={(v) => !v && setAssignFor(null)} onDone={refreshRoles} />
      <RoleFormDialog role={roleForm} onOpenChange={(v) => !v && setRoleForm(undefined)} onDone={refreshRoles} />
      <ConfirmDialog
        open={!!deletingRole}
        onOpenChange={(v) => !v && setDeletingRole(null)}
        title="Delete this role?"
        description={`"${deletingRole?.name ?? ''}" will be removed from ${deletingRole?.memberIds.length ?? 0} team member(s), who lose the tabs it granted. The team members themselves are not affected.`}
        confirmLabel="Delete role"
        destructive
        loading={deleteRole.isPending}
        onConfirm={() => deletingRole && deleteRole.mutate(deletingRole.id)}
      />
    </div>
  );
}
