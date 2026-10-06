import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Google Noto emoji as images — the same set the emoji picker shows. Images,
 * not a web font: the Noto colour font renders blank in Chrome on Windows, and
 * Windows' own emoji are the flat set we don't want.
 */
const NOTO_CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-google/img/google/64/';

/** Image file name for an emoji: its code points in hex, e.g. ❤️ → "2764-fe0f". */
function unified(emoji: string, keepVariationSelector: boolean) {
  return [...emoji]
    .map((ch) => ch.codePointAt(0)!.toString(16).padStart(4, '0'))
    .filter((hex) => keepVariationSelector || hex !== 'fe0f')
    .join('-');
}

/** A grapheme that should be drawn as an emoji (not plain symbols like a bare ©). */
function isEmojiGrapheme(g: string) {
  return (
    /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(g) &&
    /\p{Emoji_Presentation}|️|\p{Regional_Indicator}|⃣|\p{Emoji_Modifier}/u.test(g)
  );
}

/**
 * One emoji as a Noto image, sized to the surrounding text (1.25em). If the
 * image is missing it retries without the variation selector, then falls back
 * to the plain character. The alt text keeps copy/paste working.
 */
export function NotoEmoji({ emoji, className }: { emoji: string; className?: string }) {
  const [attempt, setAttempt] = useState(0);
  if (attempt >= 2) return <span className={className}>{emoji}</span>;
  return (
    <img
      src={`${NOTO_CDN}${unified(emoji, attempt === 0)}.png`}
      alt={emoji}
      draggable={false}
      loading="lazy"
      onError={() => setAttempt((a) => a + 1)}
      className={cn('inline-block h-[1.25em] w-[1.25em] align-[-0.25em]', className)}
    />
  );
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Split text into plain strings and Noto emoji images. */
export function withNotoEmoji(text: string, keyPrefix = 'e'): ReactNode[] {
  const out: ReactNode[] = [];
  let plain = '';
  let i = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (isEmojiGrapheme(segment)) {
      if (plain) out.push(plain);
      plain = '';
      out.push(<NotoEmoji key={`${keyPrefix}-${i++}`} emoji={segment} />);
    } else {
      plain += segment;
    }
  }
  if (plain) out.push(plain);
  return out;
}
