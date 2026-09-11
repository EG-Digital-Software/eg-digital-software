import { useEffect, useRef, useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Loader2, ImagePlus } from 'lucide-react';
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
import { usePdfDocument } from '@/hooks/usePdfDocument';
import type { AgreementField, CustomerDocument } from '@/types';

/** A signature image the client selected, kept as a data URL until save. */
interface SigImage {
  dataUrl: string;
  isPng: boolean;
}

export interface AgreementSignDialogProps {
  document: CustomerDocument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the filled + signed PDF bytes when the client saves. */
  onSubmit: (bytes: Uint8Array) => Promise<void>;
  submitting?: boolean;
}

/**
 * Client-facing fill-and-sign viewer. Renders the agreement PDF read-only and overlays
 * an input on every region the admin marked (text) plus a signature-image picker on
 * signature regions, then draws the values straight onto the page with pdf-lib. Because
 * the values are painted onto the page (not interactive form fields), the result is
 * non-editable.
 */
export default function AgreementSignDialog({
  document: doc,
  open,
  onOpenChange,
  onSubmit,
  submitting,
}: AgreementSignDialogProps) {
  const { loading, error: loadError, bytes, pages, mountCanvas } = usePdfDocument(doc.url, open);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sigs, setSigs] = useState<Record<string, SigImage>>({});
  // One hidden file input, retargeted to whichever signature box was clicked.
  const fileRef = useRef<HTMLInputElement>(null);
  const pickingFor = useRef<string | null>(null);

  const fields: AgreementField[] = doc.fields ?? [];

  useEffect(() => {
    if (open) {
      setValues({});
      setSigs({});
      setError(null);
    }
  }, [open]);

  const pickImage = (fieldId: string) => {
    pickingFor.current = fieldId;
    fileRef.current?.click();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const fieldId = pickingFor.current;
    e.target.value = '';
    if (!file || !fieldId) return;
    const reader = new FileReader();
    reader.onload = () =>
      setSigs((s) => ({
        ...s,
        [fieldId]: { dataUrl: String(reader.result), isPng: file.type.includes('png') },
      }));
    reader.readAsDataURL(file);
  };

  async function handleSave() {
    setError(null);
    const src = bytes.current;
    if (!src) return;
    try {
      const out = await PDFDocument.load(src);
      const font = await out.embedFont(StandardFonts.Helvetica);
      const outPages = out.getPages();

      for (const f of fields) {
        const page = outPages[f.page] ?? outPages[0];
        const { width: pw, height: ph } = page.getSize();
        const boxW = f.wPct * pw;
        const boxH = f.hPct * ph;
        const x = f.xPct * pw;
        const yBottom = ph - f.yPct * ph - boxH;

        if (f.kind === 'text') {
          const v = values[f.id]?.trim();
          if (!v) continue;
          // Normal document text size — only shrink for an unusually short box.
          const size = Math.min(11, boxH * 0.9);
          page.drawText(v, {
            x: x + 2,
            y: yBottom + (boxH - size) / 2 + size * 0.12,
            size,
            font,
            color: rgb(0.07, 0.09, 0.15),
          });
        } else {
          const sig = sigs[f.id];
          if (!sig) continue;
          const imgBytes = new Uint8Array(await (await fetch(sig.dataUrl)).arrayBuffer());
          const img = sig.isPng ? await out.embedPng(imgBytes) : await out.embedJpg(imgBytes);
          // Fit inside the box preserving aspect ratio, centred.
          const ratio = Math.min(boxW / img.width, boxH / img.height);
          const w = img.width * ratio;
          const h = img.height * ratio;
          page.drawImage(img, {
            x: x + (boxW - w) / 2,
            y: yBottom + (boxH - h) / 2,
            width: w,
            height: h,
          });
        }
      }

      const signed = await out.save();
      await onSubmit(signed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the signed document');
    }
  }

  const noFields = !loading && !loadError && fields.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Review &amp; sign — {doc.fileName}</DialogTitle>
          <DialogDescription>
            Fill the highlighted fields and add your signature image. Nothing is downloaded until an admin approves it.
          </DialogDescription>
        </DialogHeader>

        <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onFileChange} />

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading document…
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        ) : noFields ? (
          <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
            This document isn’t ready to sign yet. Please check back once the admin has marked the fields to fill.
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="max-h-[58vh] space-y-6 overflow-y-auto pr-1">
              {pages.map((layout) => (
                <div
                  key={layout.index}
                  className="relative mx-auto border border-border shadow-sm"
                  style={{ width: layout.widthPx, height: layout.heightPx }}
                >
                  <canvas ref={mountCanvas(layout)} className="block h-full w-full" />
                  {fields
                    .filter((f) => f.page === layout.index)
                    .map((f) => {
                      const style = {
                        left: f.xPct * layout.widthPx,
                        top: f.yPct * layout.heightPx,
                        width: f.wPct * layout.widthPx,
                        height: f.hPct * layout.heightPx,
                      };
                      if (f.kind === 'text') {
                        return (
                          <Input
                            key={f.id}
                            value={values[f.id] ?? ''}
                            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                            placeholder={f.label}
                            title={f.label}
                            className="absolute rounded-sm border border-primary/60 bg-white/90 px-1 py-0 text-xs shadow-sm focus:bg-white"
                            style={style}
                          />
                        );
                      }
                      const sig = sigs[f.id];
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => pickImage(f.id)}
                          title={`${f.label} — click to upload a signature image`}
                          className="absolute flex items-center justify-center overflow-hidden rounded-sm border border-dashed border-primary bg-white/85 hover:bg-white"
                          style={style}
                        >
                          {sig ? (
                            <img src={sig.dataUrl} alt="Signature" className="h-full w-full object-contain" />
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-primary">
                              <ImagePlus className="h-3.5 w-3.5" /> Signature
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={loading || !!loadError || noFields || submitting}>
            {submitting ? 'Submitting…' : 'Save & submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
