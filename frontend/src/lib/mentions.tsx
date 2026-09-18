import type { ReactNode } from 'react';

/**
 * @mention tokens live inline in a chat message body as `@[Full Name](ROLE:userId)`.
 * Keeping them inside the existing message text — rather than a separate table —
 * means mentions need no schema change: the same string round-trips through the
 * API, optimistic UI and export untouched. These helpers read that token back
 * out for display and previews.
 */
export const MENTION_RE =
  /@\[([^\]]+)\]\((SUPER_ADMIN|EMPLOYEE|CLIENT|SUPPLIER):([0-9a-fA-F-]+)\)/g;

/** Plain text with each mention collapsed to `@Full Name` (previews / export). */
export function stripMentions(body: string): string {
  return body.replace(MENTION_RE, '@$1');
}

/** Render a message body, turning mention tokens into highlighted chips. */
export function renderMessageBody(body: string, opts?: { meId?: string }): ReactNode {
  const nodes: ReactNode[] = [];
  const re = new RegExp(MENTION_RE.source, 'g');
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    if (match.index > last) nodes.push(body.slice(last, match.index));
    const name = match[1];
    const id = match[3];
    const isMe = !!opts?.meId && id === opts.meId;
    nodes.push(
      <span
        key={`m-${key++}`}
        className={
          'rounded px-1 font-semibold ' +
          (isMe ? 'bg-amber-200 text-amber-900' : 'bg-primary/15 text-primary')
        }
      >
        @{name}
      </span>
    );
    last = re.lastIndex;
  }
  if (last < body.length) nodes.push(body.slice(last));
  return nodes;
}
