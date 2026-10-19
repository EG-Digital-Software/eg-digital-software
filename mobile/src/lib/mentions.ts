/**
 * Chat @mentions are stored inline in the message body as
 * `@[Full Name](ROLE:userId)` — the same format the web app writes, so
 * messages round-trip between web and mobile untouched.
 */
const MENTION_RE = /@\[([^\]]+)\]\((SUPER_ADMIN|EMPLOYEE|CLIENT|SUPPLIER):([0-9a-fA-F-]+)\)/g;
const URL_RE = /(https?:\/\/[^\s]+)/g;

export type Segment =
  | { type: 'text'; text: string }
  | { type: 'mention'; name: string; userId: string }
  | { type: 'link'; url: string };

function splitLinks(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index! > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    out.push({ type: 'link', url: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

export function parseMessage(body: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    if (m.index! > last) out.push(...splitLinks(body.slice(last, m.index)));
    out.push({ type: 'mention', name: m[1]!, userId: m[3]! });
    last = m.index! + m[0].length;
  }
  if (last < body.length) out.push(...splitLinks(body.slice(last)));
  return out;
}

/** Plain text with each mention collapsed to `@Full Name` (previews). */
export const stripMentions = (body: string) => body.replace(MENTION_RE, '@$1');

/** The stored token for a mention. */
export const mentionToken = (u: { name: string; userType: string; userId: string }) =>
  `@[${u.name}](${u.userType}:${u.userId})`;
