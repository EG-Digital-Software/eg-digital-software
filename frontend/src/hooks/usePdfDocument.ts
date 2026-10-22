import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
// Vite resolves this to a served worker URL; pdf.js needs it before rendering.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api } from '@/api/client';

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
 * Load a PDF (by its API file path, e.g. `/client/documents/:id/file`) for on-screen viewing.
 * Fetched through the API rather than straight from storage, so the viewer never
 * depends on the blob's CORS rules. Returns the raw bytes (kept for
 * pdf-lib editing), per-page layouts, and a ref callback that renders each page into
 * its canvas the first time it mounts. Shared by the admin field-placement dialog and
 * the client fill-and-sign dialog so both render identically.
 */
export function usePdfDocument(filePath: string | undefined, open: boolean, width?: number) {
  // Fit the page to the near-full-screen viewer (95vw minus dialog padding/scrollbar),
  // fixed at mount so re-renders don't re-load the PDF. Field coords are page-relative %.
  const [autoWidth] = useState(() =>
    Math.min(1200, Math.max(320, Math.round(window.innerWidth * 0.95) - 80))
  );
  const renderWidth = width ?? autoWidth;
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
        if (!filePath) throw new Error('Document URL missing');
        const res = await api.get<ArrayBuffer>(filePath, { responseType: 'arraybuffer' }).catch(() => {
          throw new Error('Could not load the document');
        });
        const bytes = new Uint8Array(res.data);
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
  }, [open, filePath, renderWidth]);

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
