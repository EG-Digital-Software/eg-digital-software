import * as pdfjs from 'pdfjs-dist';
import type { AgreementField } from '@/types';

/**
 * Find the blank checkboxes printed on an agreement PDF so the admin doesn't have
 * to mark each one by hand. Three kinds are picked up, page by page:
 *  1. real PDF form checkboxes (AcroForm widgets) that are still unticked,
 *  2. empty-box glyphs typed as text (☐ □ ▢ ❏ … and the Wingdings box characters),
 *  3. small square outlines drawn as vector paths (how Word / Google Docs often
 *     export them).
 * Boxes already ticked, crossed or filled in (☑ ☒ ■, a ✓ drawn or typed inside)
 * are left out. Read-only: it only inspects the document. Results are
 * page-fraction regions (top-left origin) in the same shape as admin-placed
 * fields, of kind 'checkbox'.
 */

type Box = { page: number; x: number; y: number; w: number; h: number };

// Empty-box characters, including the Wingdings code points pdf.js exposes as
// private-use characters (o = □, q = ❑, ¨ = ☐ in Wingdings). Ticked / crossed
// boxes (☑ ☒, Wingdings þ ý) are deliberately not listed.
const BOX_GLYPHS = /[☐□▢❏❐❑❒⬜◻◽]/;

// Square side, in PDF points, a drawn checkbox usually has (≈2–9 mm).
const MIN_SIDE = 5.5;
const MAX_SIDE = 26;

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

const squareish = (w: number, h: number) =>
  w >= MIN_SIDE && h >= MIN_SIDE && w <= MAX_SIDE && h <= MAX_SIDE && w / h > 0.78 && w / h < 1.28;

const iou = (a: Box, b: Box) => {
  if (a.page !== b.page) return 0;
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
};

/** Do two regions cover the same spot (or one sit inside the other)? */
export function overlaps(a: Box, b: Box): boolean {
  if (a.page !== b.page) return false;
  if (iou(a, b) > 0.3) return true;
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  return cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.h;
}

/** Page-space rectangle (PDF user units, bottom-left origin) → page-fraction box. */
function toBox(page: number, vp: pdfjs.PageViewport, x1: number, y1: number, x2: number, y2: number): Box {
  const [ax, ay] = vp.convertToViewportPoint(x1, y1);
  const [bx, by] = vp.convertToViewportPoint(x2, y2);
  const left = Math.min(ax, bx);
  const top = Math.min(ay, by);
  return {
    page,
    x: left / vp.width,
    y: top / vp.height,
    w: Math.abs(bx - ax) / vp.width,
    h: Math.abs(by - ay) / vp.height,
  };
}

type Widget = {
  subtype?: string;
  fieldType?: string;
  checkBox?: boolean;
  rect?: number[];
  fieldValue?: unknown;
  exportValue?: unknown;
};

/** A form checkbox's value is "Off" (or empty) until it is ticked. */
const unticked = (a: Widget) =>
  !a.fieldValue || a.fieldValue === 'Off' || (typeof a.exportValue === 'string' && a.fieldValue !== a.exportValue);

async function formCheckboxes(page: pdfjs.PDFPageProxy, index: number, vp: pdfjs.PageViewport): Promise<Box[]> {
  const annots = (await page.getAnnotations()) as Widget[];
  return annots
    .filter((a) => a.subtype === 'Widget' && a.fieldType === 'Btn' && a.checkBox && a.rect?.length === 4 && unticked(a))
    .map((a) => toBox(index, vp, a.rect![0], a.rect![1], a.rect![2], a.rect![3]));
}

/**
 * Empty-box glyphs (candidates) plus every other visible character on the page
 * (marks) — a ✓ or ✗ typed over a box means it is already ticked.
 */
async function textScan(
  page: pdfjs.PDFPageProxy,
  index: number,
  vp: pdfjs.PageViewport
): Promise<{ boxes: Box[]; marks: Box[] }> {
  const text = await page.getTextContent();
  const boxes: Box[] = [];
  const marks: Box[] = [];
  for (const item of text.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const [a, b, c, d, e, f] = item.transform as Matrix;
    const size = Math.hypot(c, d) || Math.hypot(a, b);
    const chars = [...item.str];
    const charW = chars.length ? item.width / chars.length : size;
    const ux = Math.hypot(a, b) ? a / Math.hypot(a, b) : 1;
    const uy = Math.hypot(a, b) ? b / Math.hypot(a, b) : 0;
    chars.forEach((ch, i) => {
      if (!ch.trim()) return;
      if (BOX_GLYPHS.test(ch)) {
        // A box glyph fills most of the em square, sitting just above the baseline.
        const side = Math.min(size * 0.8, Math.max(charW, size * 0.6));
        const ox = e + ux * (i * charW + (charW - side) / 2);
        const oy = f + uy * (i * charW) - size * 0.05;
        boxes.push(toBox(index, vp, ox, oy, ox + side, oy + side));
      } else {
        const ox = e + ux * i * charW;
        const oy = f + uy * i * charW;
        marks.push(toBox(index, vp, ox, oy, ox + charW, oy + size * 0.7));
      }
    });
  }
  return { boxes, marks };
}

/** '#rrggbb' → 0 (black) … 1 (white). Anything unreadable counts as dark. */
function lightness(color: unknown): number {
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return 0;
  const n = parseInt(color.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** A small square drawn on the page: `filled` = painted solid (no outline stroke). */
type Square = Box & { filled: boolean; light: boolean };

/**
 * Small squares drawn as vector paths (candidates) plus every other visible
 * shape on the page (marks) — a tick, cross or dot drawn inside a square.
 */
async function pathScan(
  page: pdfjs.PDFPageProxy,
  index: number,
  vp: pdfjs.PageViewport
): Promise<{ squares: Square[]; marks: Box[] }> {
  // Page content only — form widgets (and their drawn appearance) are read from
  // the annotations instead.
  const { fnArray, argsArray } = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
  const OPS = pdfjs.OPS;
  const FILLS = new Set<number>([
    OPS.fill,
    OPS.eoFill,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ]);
  const STROKES = new Set<number>([
    OPS.stroke,
    OPS.closeStroke,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ]);
  type State = { ctm: Matrix; fill: unknown; stroke: unknown };
  const stack: State[] = [];
  let st: State = { ctm: IDENTITY, fill: '#000000', stroke: '#000000' };
  const squares: Square[] = [];
  const marks: Box[] = [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    if (fn === OPS.save) stack.push({ ...st });
    else if (fn === OPS.restore) st = stack.pop() ?? st;
    else if (fn === OPS.transform) st = { ...st, ctm: mul(st.ctm, args as Matrix) };
    else if (fn === OPS.setFillRGBColor) st = { ...st, fill: args?.[0] };
    else if (fn === OPS.setStrokeRGBColor) st = { ...st, stroke: args?.[0] };
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push({ ...st });
      if (Array.isArray(args?.[0]) && args[0].length === 6) st = { ...st, ctm: mul(st.ctm, args[0] as Matrix) };
    } else if (fn === OPS.paintFormXObjectEnd) st = stack.pop() ?? st;
    else if (fn === OPS.constructPath) {
      // pdf.js 6: [paintOp, [drawOps], minMax]; drawOps is a flat list of
      // moveTo / lineTo / curveTo / closePath codes followed by their points.
      const paint = args?.[0] as number;
      const filled = FILLS.has(paint);
      const stroked = STROKES.has(paint);
      if (!filled && !stroked) continue; // clip / endPath — nothing visible
      const light = stroked ? lightness(st.stroke) > 0.85 : lightness(st.fill) > 0.85;
      const data = (args?.[1] as unknown[] | undefined)?.[0] as ArrayLike<number> | undefined;
      if (!data || typeof data.length !== 'number') continue;
      let pts: [number, number][] = [];
      let curved = false;
      const flush = () => {
        if (!pts.length) return;
        const mapped = pts.map(([x, y]) => apply(st.ctm, x, y));
        const xs = mapped.map((p) => p[0]);
        const ys = mapped.map((p) => p[1]);
        const x1 = Math.min(...xs);
        const x2 = Math.max(...xs);
        const y1 = Math.min(...ys);
        const y2 = Math.max(...ys);
        // Every corner must sit on the bounding box — a rectangle, not a shape.
        const rect =
          !curved &&
          pts.length >= 4 &&
          pts.length <= 6 &&
          mapped.every(
            ([x, y]) =>
              (Math.abs(x - x1) < 0.6 || Math.abs(x - x2) < 0.6) && (Math.abs(y - y1) < 0.6 || Math.abs(y - y2) < 0.6)
          );
        const box = toBox(index, vp, x1, y1, Math.max(x2, x1 + 0.1), Math.max(y2, y1 + 0.1));
        if (rect && squareish(x2 - x1, y2 - y1)) squares.push({ ...box, filled: !stroked, light });
        else if (!light) marks.push(box);
        pts = [];
        curved = false;
      };
      for (let k = 0; k < data.length; ) {
        const op = data[k++];
        if (op === 0) {
          flush();
          pts.push([data[k++], data[k++]]);
        } else if (op === 1) {
          pts.push([data[k++], data[k++]]);
        } else if (op === 2) {
          curved = true;
          pts.push([data[k + 4], data[k + 5]]);
          k += 6;
        } else if (op === 3) {
          curved = true;
          pts.push([data[k + 2], data[k + 3]]);
          k += 4;
        } else if (op === 4) {
          // closePath — keep collecting until the next moveTo.
        } else break;
      }
      flush();
    }
  }
  return { squares, marks };
}

/** Does `inner` sit in `outer`'s interior (its border trimmed off) and is it smaller? */
function insideInterior(inner: Box, outer: Box): boolean {
  if (inner.page !== outer.page) return false;
  const padX = outer.w * 0.12;
  const padY = outer.h * 0.12;
  const cx = inner.x + inner.w / 2;
  const cy = inner.y + inner.h / 2;
  return (
    cx > outer.x + padX &&
    cx < outer.x + outer.w - padX &&
    cy > outer.y + padY &&
    cy < outer.y + outer.h - padY &&
    inner.w * inner.h < outer.w * outer.h * 0.8
  );
}

/**
 * Keep only blank boxes: nothing drawn or typed inside them. A solid dark square
 * is a bullet or a filled-in box, not an empty checkbox — unless a lighter square
 * sits on top of it, which is how some exporters draw a box outline.
 */
function blankBoxes(glyphs: Box[], squares: Square[], textMarks: Box[], pathMarks: Box[]): Box[] {
  const lightFills = squares.filter((q) => q.filled && q.light);
  const dark = squares.filter((q) => !q.light);
  const candidates: Box[] = [...glyphs];
  // A dark square inside a bigger one is a mark in that box (a filled dot) or its inner border.
  const nested: Box[] = [];
  for (const q of dark) {
    if (dark.some((o) => o !== q && insideInterior(q, o))) {
      nested.push(q);
      continue;
    }
    if (!q.filled) candidates.push(q);
    // Dark fill with a lighter fill on top = an outline; a plain dark fill = solid ■, skipped.
    else if (lightFills.some((l) => l.w * l.h < q.w * q.h && overlaps(l, q))) candidates.push(q);
  }
  // A dark square that is itself the inner border of an outline isn't a tick.
  const marks = [...textMarks, ...pathMarks, ...nested.filter((n) => n.w * n.h > 0)];
  return candidates.filter(
    (c) =>
      !marks.some((m) => {
        if (m === c || !insideInterior(m, c)) return false;
        // An inner border (a square nearly the box's size) doesn't count as a mark.
        return !(squares.includes(m as Square) && m.w * m.h > c.w * c.h * 0.55);
      })
  );
}

/**
 * Detect the blank (unticked) checkbox regions in a loaded PDF. Boxes already
 * ticked, crossed or filled in are left out. Never throws — a page that can't be
 * read simply contributes nothing.
 */
export async function detectCheckboxes(pdf: pdfjs.PDFDocumentProxy): Promise<AgreementField[]> {
  const boxes: Box[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    try {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const [form, text, paths] = await Promise.all([
        formCheckboxes(page, p - 1, vp).catch(() => [] as Box[]),
        textScan(page, p - 1, vp).catch(() => ({ boxes: [] as Box[], marks: [] as Box[] })),
        pathScan(page, p - 1, vp).catch(() => ({ squares: [] as Square[], marks: [] as Box[] })),
      ]);
      const found = [...form, ...blankBoxes(text.boxes, paths.squares, text.marks, paths.marks)];
      // Earlier ones win: a form widget beats a glyph, a glyph beats a drawn square.
      for (const b of found) {
        const dupe = boxes.findIndex((o) => overlaps(o, b) || overlaps(b, o));
        if (dupe === -1) boxes.push(b);
      }
    } catch {
      /* skip unreadable page */
    }
  }
  boxes.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  return boxes.map((b, i) => ({
    id: crypto.randomUUID(),
    kind: 'checkbox',
    label: `Checkbox ${i + 1}`,
    page: b.page,
    xPct: b.x,
    yPct: b.y,
    wPct: b.w,
    hPct: b.h,
  }));
}
