import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePdfDocument } from '@/hooks/usePdfDocument';

/**
 * Read-only in-app viewer for an agreement PDF (e.g. the client's filled + signed
 * copy). Loads through the API like the sign/field dialogs, so it never depends on
 * the storage blob's CORS rules. Nothing is edited or saved.
 */
export function AgreementViewDialog({
  filePath,
  title,
  description,
  open,
  onOpenChange,
  actions,
}: {
  /** API path of the PDF, e.g. `/customers/:clientId/documents/:id/file?signed=1`. */
  filePath: string;
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Extra footer buttons (approve / not approve…). */
  actions?: ReactNode;
}) {
  const { loading, error, pages, mountCanvas } = usePdfDocument(filePath, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw] flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading document…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
            {pages.map((layout) => (
              <div
                key={layout.index}
                className="relative mx-auto border border-border bg-white shadow-sm"
                style={{ width: layout.widthPx, height: layout.heightPx }}
              >
                <canvas ref={mountCanvas(layout)} className="block h-full w-full" />
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {actions}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
