import { cn } from '@/lib/utils';

/**
 * The little red "something changed here" dot used on sidebar tabs, in-page
 * sections and list rows. Renders nothing when there's nothing new, so callers
 * can drop it in unconditionally: `<ChangeDot show={isNew(key, sig)} />`.
 */
export function ChangeDot({ show, className }: { show: boolean; className?: string }) {
  if (!show) return null;
  return (
    <span
      role="status"
      aria-label="New updates"
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-destructive', className)}
    />
  );
}

/**
 * Signature for a list/section: item count + the newest timestamp among them.
 * Moves on add (count), edit (timestamp) and delete (count) — the same shape the
 * server uses for tab signatures, so both sides agree on "changed".
 */
export function listSignature(
  items: Array<Record<string, unknown>> | undefined,
  timestampKeys: string[] = ['updatedAt', 'createdAt']
): string {
  if (!items || items.length === 0) return '0:0';
  let max = 0;
  for (const it of items) {
    for (const k of timestampKeys) {
      const v = it[k];
      if (typeof v === 'string' || v instanceof Date) {
        const t = new Date(v).getTime();
        if (!Number.isNaN(t) && t > max) max = t;
      }
    }
  }
  return `${items.length}:${max}`;
}

/** Signature for a single row/item from its timestamp(s). */
export function rowSignature(
  item: Record<string, unknown>,
  timestampKeys: string[] = ['updatedAt', 'createdAt']
): string {
  let max = 0;
  for (const k of timestampKeys) {
    const v = item[k];
    if (typeof v === 'string' || v instanceof Date) {
      const t = new Date(v).getTime();
      if (!Number.isNaN(t) && t > max) max = t;
    }
  }
  return String(max);
}
