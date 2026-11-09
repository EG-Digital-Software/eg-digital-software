import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminApi, type PendingUser, type TeamRole } from '@/api/resources';
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
import { STAFF_TABS } from '@/lib/staffAccess';

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

/**
 * Create or edit a team role: its name and which admin tabs it grants.
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
  const [tabs, setTabs] = useState<Set<string>>(() => new Set(role?.tabs ?? []));

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), tabs: STAFF_TABS.map((t) => t.key).filter((k) => tabs.has(k)) };
      return role ? adminApi.updateTeamRole(role.id, body) : adminApi.createTeamRole(body);
    },
    onSuccess: () => {
      toast.success(role ? 'Role updated' : 'Role created');
      onDone();
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const toggle = (key: string, on: boolean) =>
    setTabs((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{role ? 'Edit Role' : 'New Role'}</DialogTitle>
        <DialogDescription>
          Team members with this role can see and edit the tabs you tick. Team, Approvals and Settings stay admin-only.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
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
              onClick={() => setTabs(tabs.size === STAFF_TABS.length ? new Set() : new Set(STAFF_TABS.map((t) => t.key)))}
            >
              {tabs.size === STAFF_TABS.length ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {STAFF_TABS.map((t) => (
              <CheckRow key={t.key} checked={tabs.has(t.key)} onChange={(v) => toggle(t.key, v)}>
                <t.icon className="h-4 w-4 text-muted-foreground" />
                {t.label}
              </CheckRow>
            ))}
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

  const granted = new Set(roles.filter((r) => picked.has(r.id)).flatMap((r) => r.tabs));

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
            {granted.size
              ? STAFF_TABS.filter((t) => granted.has(t.key)).map((t) => t.label).join(', ')
              : 'Own tasks and customers only'}
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
