import { Fragment, type ReactNode } from 'react';

/** http(s):// or www. links inside free text. */
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

/** Sentence punctuation right after a link isn't part of it ("see x.com/a." → no "."). */
function trimUrl(raw: string): string {
  let url = raw.replace(/[.,;:!?'"]+$/, '');
  // Drop a closing bracket only when it isn't balanced inside the URL, e.g. "(see https://x.com)".
  while (/[)\]]$/.test(url)) {
    const close = url.endsWith(')') ? ')' : ']';
    const open = close === ')' ? '(' : '[';
    if (url.split(open).length >= url.split(close).length) break;
    url = url.slice(0, -1);
  }
  return url;
}

/**
 * Text with links turned into clickable anchors (opening in a new tab). The
 * non-link text goes through `renderText` — chat passes Noto emoji rendering.
 */
export function linkify(
  text: string,
  keyPrefix = 'l',
  renderText: (text: string, key: string) => ReactNode[] = (t, k) => [<Fragment key={k}>{t}</Fragment>]
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = new RegExp(URL_RE.source, 'gi');
  let last = 0;
  let i = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const url = trimUrl(match[0]);
    if (!url) continue;
    if (match.index > last) nodes.push(...renderText(text.slice(last, match.index), `${keyPrefix}-${i++}`));
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    nodes.push(
      <a
        key={`${keyPrefix}-a${i++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="break-all font-medium text-sky-600 underline underline-offset-2 hover:opacity-80"
      >
        {url}
      </a>
    );
    last = match.index + url.length;
    re.lastIndex = last;
  }
  if (last < text.length) nodes.push(...renderText(text.slice(last), `${keyPrefix}-${i++}`));
  return nodes;
}

/** Drop-in for showing user-entered text: any URL in it becomes a link. */
export function Linkify({ text }: { text?: string | null }) {
  return <>{text ? linkify(text) : null}</>;
}

/** Wrap a display value: strings get links, anything else renders as-is. */
export function linkifyValue(value: ReactNode): ReactNode {
  return typeof value === 'string' ? <Linkify text={value} /> : value;
}
