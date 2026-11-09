import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi, type PendingUser } from '@/api/resources';
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

/** Admin edits a team member's profile: name, login email, designation, phone. */
export function EditEmployeeDialog({
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
export function ManageEmployeePasswordDialog({
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
