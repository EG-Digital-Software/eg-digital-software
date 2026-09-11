import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
// Vite resolves this to a served worker URL; pdf.js needs it before rendering.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { mediaUrl } from '@/lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfPageLayout {
  index: number;
  /** Rendered pixel size and the PDF-point size, for mapping overlay coords. */
  widthPx: number;
  heightPx: number;
  scale: number;
  pdfWidth: number;
  pdfHeight: number;
}

/**
 * Load a PDF (by media URL) for on-screen viewing. Returns the raw bytes (kept for
 * pdf-lib editing), per-page layouts, and a ref callback that renders each page into
 * its canvas the first time it mounts. Shared by the admin field-placement dialog and
 * the client fill-and-sign dialog so both render identically.
 */
export function usePdfDocument(url: string | undefined, open: boolean, renderWidth = 720) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<PdfPageLayout[]>([]);
  const bytesRef = useRef<Uint8Array | null>(null);
  const pdfRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const rendered = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPages([]);
    rendered.current = new Set();

    (async () => {
      try {
        const resolved = mediaUrl(url);
        if (!resolved) throw new Error('Document URL missing');
        const res = await fetch(resolved);
        if (!res.ok) throw new Error('Could not load the document');
        const bytes = new Uint8Array(await res.arrayBuffer());
        bytesRef.current = bytes;

        const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        const layouts: PdfPageLayout[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = renderWidth / base.width;
          layouts.push({
            index: i - 1,
            widthPx: Math.round(base.width * scale),
            heightPx: Math.round(base.height * scale),
            scale,
            pdfWidth: base.width,
            pdfHeight: base.height,
          });
        }
        if (cancelled) return;
        setPages(layouts);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to open document');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, url, renderWidth]);

  const mountCanvas = useCallback(
    (layout: PdfPageLayout) => (canvas: HTMLCanvasElement | null) => {
      if (!canvas || rendered.current.has(layout.index)) return;
      const pdf = pdfRef.current;
      if (!pdf) return;
      rendered.current.add(layout.index);
      pdf.getPage(layout.index + 1).then((page) => {
        const viewport = page.getViewport({ scale: layout.scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) page.render({ canvas, canvasContext: ctx, viewport });
      });
    },
    []
  );

  return { loading, error, bytes: bytesRef, pages, mountCanvas };
}
