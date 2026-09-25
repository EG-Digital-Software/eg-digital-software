import { Select } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { productUnits, productNet, findLicenceGroup, type LicenceGroup } from '@/lib/proration';

/**
 * The line-item "Product" field shared by the invoice create and edit forms, so
 * a line looks and behaves the same on both: a licence-group dropdown, plus a
 * read-only summary (licence number, then each product's SKU, agreed price,
 * Unit/Hours and pro-rated Net) once a product backs the line. A line with no
 * product falls back to whatever the form passes as `fallback` — normally its
 * own editable description textarea.
 */

export interface LineItemProductProps {
  /** Selectable licence groups for the invoice's customer. */
  groups: LicenceGroup[];
  /** The product currently backing this line (null/undefined = manual line). */
  productId?: string | null;
  /** Licence number stored on the line — shown as the summary's header. */
  sku?: string | null;
  /** Pro-rata fraction applied to each product's agreed net in the summary. */
  fraction: number;
  /** False on the create form until a customer is picked. */
  hasCustomer: boolean;
  onSelectGroup: (groupKey: string) => void;
  /** Rendered instead of the summary when no product backs this line. */
  fallback: React.ReactNode;
  /** Shared "filled control" class the parent form uses on its inputs. */
  controlClassName?: string;
}

export function LineItemProduct({
  groups,
  productId,
  sku,
  fraction,
  hasCustomer,
  onSelectGroup,
  fallback,
  controlClassName,
}: LineItemProductProps) {
  const selected = findLicenceGroup(groups, productId);

  return (
    <>
      <Select
        className={controlClassName}
        value={selected?.key ?? ''}
        onChange={(e) => onSelectGroup(e.target.value)}
      >
        <option value="">
          {hasCustomer
            ? groups.length
              ? 'Select licence / products…'
              : 'No products assigned to this client'
            : 'Select a customer first…'}
        </option>
        {groups.map((g) => (
          <option key={g.key} value={g.key}>
            {g.items.map((cp) => cp.product.name).join(' + ')}
            {g.licenceKey ? ` · ${g.licenceKey}` : ''}
          </option>
        ))}
      </Select>
      {selected ? (
        <div className="mt-1.5 space-y-1.5 rounded-md border border-border bg-slate-50/60 p-2.5 text-xs text-muted-foreground">
          {sku && (
            <div className="border-b border-border/40 pb-1.5 font-medium text-foreground">
              Licence: {sku}
            </div>
          )}
          {selected.items.map((cp) => {
            const units = productUnits(cp);
            // Net billed for this period = agreed net × pro-rata fraction.
            const net = productNet(cp) * fraction;
            return (
              <div key={cp.id} className="space-y-1 border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">{cp.product.name}</span>
                  <span className="shrink-0 text-muted-foreground/70">
                    SKU: {cp.product.sku || cp.product.productCode || '—'}
                  </span>
                </div>
                {/* Three evenly-aligned columns so Agreed / Unit-Hours / Net line
                    up perfectly across every product. */}
                <div className="grid grid-cols-3 gap-3 tabular-nums">
                  <span>
                    Agreed: <span className="text-foreground">{formatCurrency(Number(cp.price) || 0)}</span>
                  </span>
                  <span className="text-center">
                    Unit/Hours: <span className="text-foreground">{units}</span>
                  </span>
                  <span className="text-right">
                    Net: <span className="font-semibold text-primary">{formatCurrency(net)}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        fallback
      )}
    </>
  );
}
