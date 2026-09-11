import { useEffect, useRef, useState } from 'react';
import { Loader2, Trash2, Type, PenLine } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { usePdfDocument, type PdfPageLayout } from '@/hooks/usePdfDocument';
import type { AgreementField, CustomerDocument } from '@/types';

interface DragState {
  page: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
}

export interface AgreementFieldsDialogProps {
  document: CustomerDocument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (fields: AgreementField[]) => Promise<void>;
  saving?: boolean;
}

/**
 * Admin tool: mark where the client should fill and sign a (usually flat) agreement
 * PDF. The admin drags boxes onto the rendered pages; each box is stored as a page
 * fraction so it lines up for the client at any zoom.
 */
export default function AgreementFieldsDialog({
  document: doc,
  open,
  onOpenChange,
  onSave,
  saving,
}: AgreementFieldsDialogProps) {
  const { loading, error, pages, mountCanvas } = usePdfDocument(doc.url, open);
  const [fields, setFields] = useState<AgreementField[]>([]);
  const [kind, setKind] = useState<'text' | 'signature'>('text');
  const [label, setLabel] = useState('Name');
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (open) setFields(doc.fields ?? []);
  }, [open, doc.fields]);

  const relPoint = (e: React.PointerEvent, layout: PdfPageLayout) => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(layout.widthPx, e.clientX - box.left)),
      y: Math.max(0, Math.min(layout.heightPx, e.clientY - box.top)),
    };
  };

  const onPointerDown = (layout: PdfPageLayout) => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-field]')) return; // don't start on a chip
    const { x, y } = relPoint(e, layout);
    const d = { page: layout.index, startX: x, startY: y, x, y };
    dragRef.current = d;
    setDrag(d);
  };
  const onPointerMove = (layout: PdfPageLayout) => (e: React.PointerEvent) => {
    if (!dragRef.current || dragRef.current.page !== layout.index) return;
    const { x, y } = relPoint(e, layout);
    const d = { ...dragRef.current, x, y };
    dragRef.current = d;
    setDrag(d);
  };
  const onPointerUp = (layout: PdfPageLayout) => () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    const left = Math.min(d.startX, d.x);
    const top = Math.min(d.startY, d.y);
    const w = Math.abs(d.x - d.startX);
    const h = Math.abs(d.y - d.startY);
    if (w < 12 || h < 8) return; // ignore accidental clicks
    setFields((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        kind,
        label: kind === 'signature' ? label || 'Signature' : label || 'Field',
        page: layout.index,
        xPct: left / layout.widthPx,
        yPct: top / layout.heightPx,
        wPct: w / layout.widthPx,
        hPct: h / layout.heightPx,
      },
    ]);
  };

  const removeField = (id: string) => setFields((prev) => prev.filter((f) => f.id !== id));

  const previewRect =
    drag && {
      left: Math.min(drag.startX, drag.x),
      top: Math.min(drag.startY, drag.y),
      width: Math.abs(drag.x - drag.startX),
      height: Math.abs(drag.y - drag.startY),
    };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Mark fields — {doc.fileName}</DialogTitle>
          <DialogDescription>
            Choose a field type, then drag a box on the document where the client should fill or sign.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 p-2">
          <Button type="button" size="sm" variant={kind === 'text' ? 'default' : 'outline'} onClick={() => { setKind('text'); if (label === 'Signature') setLabel('Name'); }}>
            <Type className="h-4 w-4" /> Text
          </Button>
          <Button type="button" size="sm" variant={kind === 'signature' ? 'default' : 'outline'} onClick={() => { setKind('signature'); setLabel('Signature'); }}>
            <PenLine className="h-4 w-4" /> Signature
          </Button>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Full name)"
            className="h-9 w-48"
          />
          <span className="ml-auto text-xs text-muted-foreground">{fields.length} field{fields.length === 1 ? '' : 's'} placed</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading document…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
        ) : (
          <div className="max-h-[58vh] space-y-6 overflow-y-auto pr-1">
            {pages.map((layout) => (
              <div
                key={layout.index}
                className="relative mx-auto touch-none select-none border border-border shadow-sm"
                style={{ width: layout.widthPx, height: layout.heightPx }}
                onPointerDown={onPointerDown(layout)}
                onPointerMove={onPointerMove(layout)}
                onPointerUp={onPointerUp(layout)}
                onPointerLeave={onPointerUp(layout)}
              >
                <canvas ref={mountCanvas(layout)} className="pointer-events-none block h-full w-full" />
                {fields
                  .filter((f) => f.page === layout.index)
                  .map((f) => (
                    <div
                      key={f.id}
                      data-field
                      className={cn(
                        'absolute flex items-start justify-between gap-1 rounded-sm border-2 text-[10px] font-medium',
                        f.kind === 'signature'
                          ? 'border-dashed border-primary bg-primary/10 text-primary'
                          : 'border-blue-500 bg-blue-500/10 text-blue-700'
                      )}
                      style={{
                        left: f.xPct * layout.widthPx,
                        top: f.yPct * layout.heightPx,
                        width: f.wPct * layout.widthPx,
                        height: f.hPct * layout.heightPx,
                      }}
                    >
                      <span className="truncate px-1 leading-tight">{f.label}</span>
                      <button
                        type="button"
                        onClick={() => removeField(f.id)}
                        className="shrink-0 rounded-sm bg-white/80 p-0.5 text-destructive hover:bg-white"
                        title="Remove field"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                {previewRect && drag?.page === layout.index && (
                  <div
                    className="pointer-events-none absolute rounded-sm border-2 border-primary bg-primary/20"
                    style={previewRect}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onSave(fields)} disabled={loading || !!error || saving}>
            {saving ? 'Saving…' : 'Save fields'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
