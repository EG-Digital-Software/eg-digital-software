import { useEffect, useRef, useState } from 'react';
import { CheckSquare, Loader2, Lock, ScanSearch, Trash2, Type } from 'lucide-react';
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
import { detectCheckboxes, overlaps } from '@/lib/detectCheckboxes';
import type { AgreementField, CustomerDocument } from '@/types';

interface DragState {
  page: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
}

export interface AgreementFieldsDialogProps {
  clientId: string;
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
  clientId,
  document: doc,
  open,
  onOpenChange,
  onSave,
  saving,
}: AgreementFieldsDialogProps) {
  // Once the client has submitted (or the agreement is approved), the admin works
  // on the signed copy: fields already filled in are locked — they can't be moved
  // or removed — and only new fields can be added. Saving never changes the status.
  const signedCopy = !!doc.signedUrl;
  const lockedIds = new Set(
    signedCopy
      ? (doc.fields ?? []).some((f) => f.filledBy)
        ? (doc.fields ?? []).filter((f) => f.filledBy).map((f) => f.id)
        : (doc.fields ?? []).map((f) => f.id) // older copies were filled completely
      : []
  );
  const { loading, error, pdf, pages, mountCanvas } = usePdfDocument(
    `/customers/${clientId}/documents/${doc.id}/file${signedCopy ? '?signed=1' : ''}`,
    open
  );
  const [fields, setFields] = useState<AgreementField[]>([]);
  // Admins place text fields or checkboxes; existing signature fields still render below.
  const [tool, setTool] = useState<'text' | 'checkbox'>('text');
  const [label, setLabel] = useState('Signature');
  const [detecting, setDetecting] = useState(false);
  const [detectNote, setDetectNote] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (open) setFields(doc.fields ?? []);
  }, [open, doc.fields]);

  /** Add detected checkboxes that aren't already covered by a field. */
  const applyDetected = (found: AgreementField[]) => {
    let added = 0;
    setFields((prev) => {
      const fresh = found.filter(
        (c) =>
          !prev.some((f) => {
            const a = {
              page: f.page,
              x: f.xPct,
              y: f.yPct,
              w: f.wPct,
              h: f.hPct,
            };
            const b = {
              page: c.page,
              x: c.xPct,
              y: c.yPct,
              w: c.wPct,
              h: c.hPct,
            };
            return overlaps(a, b) || overlaps(b, a);
          })
      );
      added = fresh.length;
      return [...prev, ...fresh];
    });
    setDetectNote(
      added > 0
        ? `${added} checkbox${added === 1 ? '' : 'es'} found and added — check them, then Save fields.`
        : 'No new checkboxes found. Use the Checkbox tool to add any by hand.'
    );
  };

  const runDetect = async () => {
    const loaded = pdf.current;
    if (!loaded) return;
    setDetecting(true);
    try {
      applyDetected(await detectCheckboxes(loaded));
    } finally {
      setDetecting(false);
    }
  };

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
    let left = Math.min(d.startX, d.x);
    let top = Math.min(d.startY, d.y);
    let w = Math.abs(d.x - d.startX);
    let h = Math.abs(d.y - d.startY);
    if (tool === 'checkbox' && w < 12 && h < 12) {
      // A click with the Checkbox tool drops a standard-size box (≈4.5 mm) there.
      const side = 13 * layout.scale;
      left = Math.max(0, Math.min(layout.widthPx - side, d.startX - side / 2));
      top = Math.max(0, Math.min(layout.heightPx - side, d.startY - side / 2));
      w = side;
      h = side;
    } else if (w < 12 || h < 8) return; // ignore accidental clicks
    setFields((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        kind: tool,
        label: tool === 'checkbox' ? label || 'Checkbox' : label || 'Signature',
        page: layout.index,
        xPct: left / layout.widthPx,
        yPct: top / layout.heightPx,
        wPct: w / layout.widthPx,
        hPct: h / layout.heightPx,
      },
    ]);
  };

  const removeField = (id: string) => {
    if (lockedIds.has(id)) return;
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

  const previewRect = drag && {
    left: Math.min(drag.startX, drag.x),
    top: Math.min(drag.startY, drag.y),
    width: Math.abs(drag.x - drag.startX),
    height: Math.abs(drag.y - drag.startY),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw] flex-col">
        <DialogHeader>
          <DialogTitle>Mark fields — {doc.fileName}</DialogTitle>
          <DialogDescription>
            {signedCopy
              ? 'Fields already filled in are locked. Set a label and drag a box to add a new field — you or your team fill it in with “Fill remaining”. The status stays as it is and nothing goes back to the client.'
              : 'Set a label, then drag a box where the client should fill in text. Checkboxes on the document are found automatically — use the Checkbox tool to add any that were missed.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 p-2">
          <Button
            type="button"
            size="sm"
            variant={tool === 'text' ? 'default' : 'outline'}
            onClick={() => setTool('text')}
          >
            <Type className="h-4 w-4" /> Text
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tool === 'checkbox' ? 'default' : 'outline'}
            onClick={() => setTool('checkbox')}
            title="Click on the document to drop a checkbox, or drag to size one"
          >
            <CheckSquare className="h-4 w-4" /> Checkbox
          </Button>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Full name)"
            className="h-9 w-48"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void runDetect()}
            disabled={loading || !!error || detecting}
            title="Find the checkboxes printed on this document and add them"
          >
            {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />} Detect
            checkboxes
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {fields.length} field{fields.length === 1 ? '' : 's'} placed
          </span>
        </div>
        {detectNote && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700">
            {detectNote}
          </div>
        )}

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
                      title={lockedIds.has(f.id) ? 'Already filled in — locked' : undefined}
                      className={cn(
                        'absolute flex items-start justify-between gap-1 rounded-sm border-2 text-[10px] font-medium',
                        lockedIds.has(f.id)
                          ? 'border-dashed border-slate-400 bg-slate-400/5 text-slate-500'
                          : f.kind === 'checkbox'
                            ? 'border-emerald-600 bg-emerald-500/15 text-emerald-700'
                            : f.kind === 'signature'
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
                      {f.kind === 'checkbox' ? (
                        <span className="sr-only">{f.label}</span>
                      ) : (
                        <span className="truncate px-1 leading-tight">{f.label}</span>
                      )}
                      {lockedIds.has(f.id) ? (
                        <span className="shrink-0 rounded-sm bg-white/80 p-0.5" aria-label="Locked">
                          <Lock className="h-3 w-3" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeField(f.id)}
                          className="shrink-0 rounded-sm bg-white/80 p-0.5 text-destructive hover:bg-white"
                          title="Remove field"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
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
