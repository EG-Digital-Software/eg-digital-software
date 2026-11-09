import { useRef, useState, type ReactNode } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Loader2, ImagePlus, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePdfDocument } from '@/hooks/usePdfDocument';
import { api } from '@/api/client';
import type { AgreementField } from '@/types';

/** Every field takes either typed text or an uploaded image (e.g. a signature). */
type Entry = { mode: 'image'; dataUrl: string; isPng: boolean } | { mode: 'text'; text: string };

export interface AgreementFillDialogProps {
  /** API path of the PDF to fill on top of. */
  filePath: string;
  /** Only these regions get an input; everything else stays as rendered. */
  fields: AgreementField[];
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the filled PDF bytes and the ids of the fields that were filled. */
  onSubmit: (bytes: Uint8Array, filledFieldIds: string[]) => Promise<void>;
  submitting?: boolean;
  submitLabel: string;
  /** Banner above the pages (e.g. "not approved"). */
  notice?: ReactNode;
  /** Shown when there is nothing to fill. */
  emptyMessage: string;
  /**
   * API path returning `{ name, ip }` of whoever is signing (IP read server-side),
   * stamped as "Signed By … IP - …" in the last page's footer. `footerLine` 0 is
   * the client's line, 1 the admin's line below it.
   */
  signer: { path: string; footerLine: 0 | 1 };
}

/** Standard PDF fonts only encode Latin-1; swap anything else so drawing never throws. */
const latin1 = (v: string) => v.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

const isFilled = (e?: Entry) => !!e && (e.mode === 'image' || !!e.text.trim());

/**
 * Fill-and-sign viewer shared by the client and admin portals. Renders the PDF
 * read-only and overlays every given region with a box that takes typed text or
 * an uploaded image (a signature, a stamp…), then draws the
 * values straight onto the page with pdf-lib so the result is non-editable.
 * Fields may be left empty — only the filled ones are drawn and reported. Callers
 * mount it per document, so every opening starts with empty inputs.
 */
export function AgreementFillDialog({
  filePath,
  fields,
  title,
  description,
  open,
  onOpenChange,
  onSubmit,
  submitting,
  submitLabel,
  notice,
  emptyMessage,
  signer,
}: AgreementFillDialogProps) {
  const { loading, error: loadError, bytes, pages, mountCanvas } = usePdfDocument(filePath, open);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  // One hidden file input, retargeted to whichever field's image button was clicked.
  const fileRef = useRef<HTMLInputElement>(null);
  const pickingFor = useRef<string | null>(null);

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
      setEntries((s) => ({
        ...s,
        [fieldId]: { mode: 'image', dataUrl: String(reader.result), isPng: file.type.includes('png') },
      }));
    reader.readAsDataURL(file);
  };

  const setText = (fieldId: string, text: string) =>
    setEntries((s) => ({ ...s, [fieldId]: { mode: 'text', text } }));

  const clearEntry = (fieldId: string) =>
    setEntries((s) => {
      const next = { ...s };
      delete next[fieldId];
      return next;
    });

  const filledIds = fields
    .filter((f) => isFilled(entries[f.id]))
    .map((f) => f.id);

  async function handleSave() {
    setError(null);
    if (filledIds.length === 0) {
      setError('Fill at least one field before submitting.');
      return;
    }
    const src = bytes.current;
    if (!src) return;
    try {
      const out = await PDFDocument.load(src);
      const font = await out.embedFont(StandardFonts.Helvetica);
      const sigFont = await out.embedFont(StandardFonts.TimesRomanItalic);
      const outPages = out.getPages();

      for (const f of fields) {
        const page = outPages[f.page] ?? outPages[0];
        const { width: pw, height: ph } = page.getSize();
        const boxW = f.wPct * pw;
        const boxH = f.hPct * ph;
        const x = f.xPct * pw;
        const yBottom = ph - f.yPct * ph - boxH;

        const drawLine = (v: string, useFont: typeof font, max: number) => {
          let size = Math.min(max, boxH * 0.9);
          // Shrink a long value so it stays inside its box.
          const w = useFont.widthOfTextAtSize(v, size);
          if (w > boxW - 4) size = Math.max(6, size * ((boxW - 4) / w));
          page.drawText(v, {
            x: x + 2,
            y: yBottom + (boxH - size) / 2 + size * 0.12,
            size,
            font: useFont,
            color: rgb(0, 0, 0),
          });
        };

        const entry = entries[f.id];
        if (!entry) continue;
        if (entry.mode === 'text') {
          const v = entry.text.trim();
          // A typed signature reads as one; anything else as normal document text.
          if (v) drawLine(v, f.kind === 'signature' ? sigFont : font, f.kind === 'signature' ? 20 : 13);
          continue;
        }
        const imgBytes = new Uint8Array(await (await fetch(entry.dataUrl)).arrayBuffer());
        const img = entry.isPng ? await out.embedPng(imgBytes) : await out.embedJpg(imgBytes);
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

      // "Signed By <name> IP - <ip>" in the last page's footer, IP from the server.
      const who = (await api.get<{ data: { name: string; ip: string } }>(signer.path)).data.data;
      const last = outPages[outPages.length - 1];
      last.drawText(latin1(`Signed By ${who.name} IP - ${who.ip}`), {
        x: 36,
        y: signer.footerLine === 0 ? 22 : 12,
        size: 8,
        font,
        color: rgb(0.25, 0.25, 0.25),
      });

      const filled = await out.save();
      await onSubmit(filled, filledIds);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the document');
    }
  }

  const noFields = !loading && !loadError && fields.length === 0;
  const empty = fields.length - filledIds.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw] flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {notice}

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
            {emptyMessage}
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
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
                      const entry = entries[f.id];
                      const isSig = f.kind === 'signature';
                      return (
                        <div
                          key={f.id}
                          title={`${f.label} — type it or upload an image`}
                          className={`absolute flex items-center overflow-hidden rounded-sm border bg-white/90 shadow-sm focus-within:bg-white ${
                            isSig ? 'border-dashed border-primary' : 'border-primary/60'
                          }`}
                          style={style}
                        >
                          {entry?.mode === 'image' ? (
                            <img src={entry.dataUrl} alt={f.label} className="h-full min-w-0 flex-1 object-contain" />
                          ) : (
                            <input
                              value={entry?.text ?? ''}
                              onChange={(e) => setText(f.id, e.target.value)}
                              placeholder={f.label || (isSig ? 'Signature' : '')}
                              className={`h-full min-w-0 flex-1 bg-transparent px-1 text-black outline-none placeholder:text-xs placeholder:not-italic placeholder:font-sans placeholder:text-gray-500 ${
                                isSig ? 'font-serif text-lg italic' : 'text-sm font-medium'
                              }`}
                            />
                          )}
                          {entry?.mode === 'image' ? (
                            <button
                              type="button"
                              onClick={() => clearEntry(f.id)}
                              title="Remove image"
                              className="flex h-full shrink-0 items-center px-0.5 text-gray-600 hover:text-destructive"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => pickImage(f.id)}
                              title="Upload an image instead (e.g. a signature)"
                              className="flex h-full shrink-0 items-center px-0.5 text-primary hover:bg-primary/10"
                            >
                              <ImagePlus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </>
        )}

        <DialogFooter className="items-center">
          {!loading && !loadError && !noFields && (
            <span className="mr-auto text-sm text-muted-foreground">
              {filledIds.length} of {fields.length} filled{empty > 0 ? ' — empty fields can be filled later' : ''}
            </span>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={loading || !!loadError || noFields || filledIds.length === 0 || submitting}
          >
            {submitting ? 'Submitting…' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
