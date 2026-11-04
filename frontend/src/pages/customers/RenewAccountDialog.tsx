import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { customerApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/shared/states';
import { cn, formatDate } from '@/lib/utils';
import type { Customer } from '@/types';

const PRESETS = [1, 3, 6, 12, 24];
const MAX_MONTHS = 60;

/** End date a renewal of `months` would reach — mirrors the server rule. */
function renewalEnd(current: string | null | undefined, months: number): Date {
  const now = new Date();
  const from = current && new Date(current) > now ? new Date(current) : now;
  const until = new Date(from);
  until.setMonth(until.getMonth() + months);
  return until;
}

/**
 * Admin "Renew account": choose how many months, and the customer's account
 * becomes ACTIVE until then. A renewal still running is extended from its end.
 */
export function RenewAccountDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [months, setMonths] = useState(12);
  const [custom, setCustom] = useState('');
  const chosen = custom ? Number(custom) : months;
  const valid = Number.isInteger(chosen) && chosen >= 1 && chosen <= MAX_MONTHS;
  const running = customer.accountRenewedUntil && new Date(customer.accountRenewedUntil) > new Date();

  const renew = useMutation({
    mutationFn: () => customerApi.renew(customer.clientId, chosen),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['customer', customer.clientId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(`Account renewed — active until ${formatDate(res.accountRenewedUntil)}`);
      onOpenChange(false);
      setCustom('');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not renew the account')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renew account</DialogTitle>
          <DialogDescription>
            The account will be set to Active for the period you choose
            {running ? `, extending the current renewal (active until ${formatDate(customer.accountRenewedUntil)})` : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Renew for</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMonths(m);
                    setCustom('');
                  }}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                    !custom && months === m
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:bg-secondary'
                  )}
                >
                  {m} {m === 1 ? 'month' : 'months'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="renew-custom" className="mb-1.5 block text-sm font-medium">
              Or enter months (1–{MAX_MONTHS})
            </label>
            <Input
              id="renew-custom"
              inputMode="numeric"
              placeholder="e.g. 18"
              value={custom}
              maxLength={2}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
              className="w-40"
            />
            {custom && !valid && (
              <p className="mt-1 text-xs text-destructive">Enter a whole number between 1 and {MAX_MONTHS}.</p>
            )}
          </div>
          {valid && (
            <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
              Account will be <span className="font-medium text-success">Active</span> until{' '}
              <span className="font-medium">{formatDate(renewalEnd(customer.accountRenewedUntil, chosen))}</span>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={renew.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => renew.mutate()} disabled={!valid || renew.isPending}>
            {renew.isPending && <Spinner />} Renew for {valid ? chosen : '—'} {chosen === 1 ? 'month' : 'months'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
