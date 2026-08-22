import { Badge } from '@/components/ui/badge';
import type { InvoiceStatus, LicenceStatus } from '@/types';

const LICENCE_MAP: Record<LicenceStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  EXPIRING_SOON: { label: 'Expiring Soon', variant: 'warning' },
  CRITICAL: { label: 'Critical', variant: 'destructive' },
  EXPIRED: { label: 'Expired', variant: 'destructive' },
  SUSPENDED: { label: 'Suspended', variant: 'muted' },
};

export function LicenceBadge({ status }: { status: LicenceStatus }) {
  const cfg = LICENCE_MAP[status] ?? LICENCE_MAP.ACTIVE;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

const INVOICE_MAP: Record<
  InvoiceStatus,
  { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'muted' | 'secondary' }
> = {
  DRAFT: { label: 'Draft', variant: 'muted' },
  SENT: { label: 'Sent', variant: 'secondary' },
  PENDING: { label: 'Pending', variant: 'warning' },
  PARTIALLY_PAID: { label: 'Partially Paid', variant: 'default' },
  PAID: { label: 'Paid', variant: 'success' },
  OVERDUE: { label: 'Overdue', variant: 'destructive' },
  CANCELLED: { label: 'Cancelled', variant: 'muted' },
};

export function InvoiceBadge({ status }: { status: InvoiceStatus }) {
  const cfg = INVOICE_MAP[status] ?? INVOICE_MAP.DRAFT;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
