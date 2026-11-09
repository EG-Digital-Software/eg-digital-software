import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminApi, type AccessMap, type PendingUser, type TeamRole } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/shared/states';
import { cn } from '@/lib/utils';
import {
  describeAccess,
  levelFor,
  STAFF_SECTIONS,
  STAFF_TABS,
  type AccessLevel,
  type StaffTab,
} from '@/lib/staffAccess';

function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm transition hover:border-primary/40">
      <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/** View / Edit switch for one tab or sub-tab. */
function LevelSwitch({ value, onChange }: { value: AccessLevel; onChange: (v: AccessLevel) => void }) {
  return (
    <div className="ml-auto inline-flex shrink-0 overflow-hidden rounded-md border border-border text-xs" role="radiogroup">
      {(['view', 'edit'] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          onClick={() => onChange(l)}
          className={cn(
            'px-2.5 py-1 font-medium transition',
            value === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
          )}
        >
          {l === 'view' ? 'View' : 'Edit'}
        </button>
      ))}
    </div>
  );
}

/** Every permission key a tab covers: its sub-tabs, or the tab itself. */
const keysOf = (tab: StaffTab) => STAFF_SECTIONS[tab]?.map((s) => `${tab}.${s.key}`) ?? [tab];

/**
 * Create or edit a team role: its name, which admin tabs (and, for Customers,
 * which sub-tabs) it grants, and whether each is view-only or editable.
 * `role` undefined = closed, null = create, a role = edit.
 */
export function RoleFormDialog({
  role,
  onOpenChange,
  onDone,
}: {
  role: TeamRole | null | undefined;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  return (
    <Dialog open={role !== undefined} onOpenChange={onOpenChange}>
      {role !== undefined && <RoleForm key={role?.id ?? 'new'} role={role} onOpenChange={onOpenChange} onDone={onDone} />}
    </Dialog>
  );
}

function RoleForm({
  role,
  onOpenChange,
  onDone,
}: {
  role: TeamRole | null;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(role?.name ?? '');
  const [access, setAccess] = useState<AccessMap>(() => ({ ...(role?.access ?? {}) }));

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), access };
      return role ? adminApi.updateTeamRole(role.id, body) : adminApi.createTeamRole(body);
    },
    onSuccess: () => {
      toast.success(role ? 'Role updated' : 'Role created');
      onDone();
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const patch = (changes: Record<string, AccessLevel | null>) =>
    setAccess((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(changes)) {
        if (v) next[k] = v;
        else delete next[k];
      }
      return next;
    });

  // Ticking a tab grants all of it at view level; the admin then narrows it down.
  const grantTab = (tab: StaffTab, on: boolean) =>
    Object.fromEntries(keysOf(tab).map((k) => [k, on ? ('view' as const) : null]));

  const allOn = STAFF_TABS.every((t) => levelFor(access, t.key));
  const selectAll = () =>
    patch(Object.assign({}, ...STAFF_TABS.filter((t) => !levelFor(access, t.key)).map((t) => grantTab(t.key, true))));

  return (
    <DialogContent size="lg">
      <DialogHeader>
        <DialogTitle>{role ? 'Edit Role' : 'New Role'}</DialogTitle>
        <DialogDescription>
          Tick the tabs this role can open, then choose View (see only) or Edit (make changes) for each. Team, Approvals
          and Settings stay admin-only.
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          <Label>Role name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Billing, Support" maxLength={60} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Tab access</Label>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => (allOn ? setAccess({}) : selectAll())}
            >
              {allOn ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="space-y-2">
            {STAFF_TABS.map((t) => {
              const sections = STAFF_SECTIONS[t.key];
              const on = levelFor(access, t.key) !== null;
              return (
                <div key={t.key} className="rounded-lg border border-border">
                  <div className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--brand)]"
                        checked={on}
                        onChange={(e) => patch(grantTab(t.key, e.target.checked))}
                      />
                      <t.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{t.label}</span>
                    </label>
                    {on &&
                      !sections &&
                      (t.viewOnly ? (
                        <span className="ml-auto text-xs text-muted-foreground">View only</span>
                      ) : (
                        <LevelSwitch value={access[t.key]} onChange={(v) => patch({ [t.key]: v })} />
                      ))}
                  </div>
                  {on && sections && (
                    <div className="space-y-1 border-t border-border bg-secondary/30 px-3 py-2">
                      {sections.map((s, i) => {
                        const key = `${t.key}.${s.key}`;
                        // The first sub-tab (Overview) is the way in — always granted with the tab.
                        const locked = i === 0;
                        return (
                          <div key={key} className="flex items-center gap-3 py-1 pl-7 text-sm">
                            <label className={cn('flex min-w-0 flex-1 items-start gap-3', !locked && 'cursor-pointer')}>
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                                checked={!!access[key]}
                                disabled={locked}
                                onChange={(e) => patch({ [key]: e.target.checked ? 'view' : null })}
                              />
                              <span className="min-w-0">
                                <span className="block">{s.label}</span>
                                <span className="block text-xs text-muted-foreground">{s.hint}</span>
                              </span>
                            </label>
                            {access[key] && <LevelSwitch value={access[key]} onChange={(v) => patch({ [key]: v })} />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Spinner />} {role ? 'Save changes' : 'Create role'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** Pick which roles a team member holds (any number). */
export function AssignRolesDialog({
  user,
  roles,
  onOpenChange,
  onDone,
}: {
  user: PendingUser | null;
  roles: TeamRole[];
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      {user && <AssignRolesForm key={user.id} user={user} roles={roles} onOpenChange={onOpenChange} onDone={onDone} />}
    </Dialog>
  );
}

function AssignRolesForm({
  user,
  roles,
  onOpenChange,
  onDone,
}: {
  user: PendingUser;
  roles: TeamRole[];
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(roles.filter((r) => r.memberIds.includes(user.id)).map((r) => r.id))
  );

  const save = useMutation({
    mutationFn: () => adminApi.setEmployeeRoles(user.id, [...picked]),
    onSuccess: () => {
      toast.success('Roles updated');
      onDone();
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  // What the picked roles add up to — edit on any role beats view.
  const granted: AccessMap = {};
  for (const r of roles.filter((r) => picked.has(r.id))) {
    for (const [k, v] of Object.entries(r.access ?? {})) if (v === 'edit' || !granted[k]) granted[k] = v;
  }
  const summary = describeAccess(granted);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Assign Roles</DialogTitle>
        <DialogDescription>
          {user.firstName} {user.lastName} · {user.email}
        </DialogDescription>
      </DialogHeader>

      {roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No roles yet — create one in the Roles tab first.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2">
            {roles.map((r) => (
              <CheckRow
                key={r.id}
                checked={picked.has(r.id)}
                onChange={(v) =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (v) next.add(r.id);
                    else next.delete(r.id);
                    return next;
                  })
                }
              >
                <span className="font-medium">{r.name}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {r.tabs.length ? STAFF_TABS.filter((t) => r.tabs.includes(t.key)).map((t) => t.label).join(', ') : 'No tabs'}
                </span>
              </CheckRow>
            ))}
          </div>
          <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Access: </span>
            {summary.length ? summary.map((x) => x.label).join('; ') : 'Own tasks and customers only'}
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button disabled={save.isPending || roles.length === 0} onClick={() => save.mutate()}>
          {save.isPending && <Spinner />} Save roles
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
