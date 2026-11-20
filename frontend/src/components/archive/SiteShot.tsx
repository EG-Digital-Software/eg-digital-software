import { useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { shotUrl } from '@/lib/siteLinks';
import { cn } from '@/lib/utils';

/** mShots answers with a small "generating" image until the real screenshot is ready. */
const PLACEHOLDER_MAX_WIDTH = 600;
const MAX_TRIES = 8;

/**
 * A screenshot of a public web page. While the screenshot service is still
 * rendering a page it hasn't seen before, this keeps asking for a few seconds.
 */
export function SiteShot({
  url,
  size = 'thumb',
  className,
  alt = '',
}: {
  url: string;
  size?: 'thumb' | 'tall';
  className?: string;
  alt?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground', className)}>
        <Globe className="h-5 w-5" />
        No preview
      </div>
    );
  }
  return (
    <div className={cn('relative h-full w-full', className)}>
      <img
        key={attempt}
        src={shotUrl(url, size, attempt)}
        alt={alt}
        loading="lazy"
        className={cn('block w-full', size === 'thumb' ? 'h-full object-cover object-top' : 'h-auto', !ready && 'invisible')}
        onLoad={(e) => {
          if (e.currentTarget.naturalWidth > PLACEHOLDER_MAX_WIDTH) return setReady(true);
          if (attempt + 1 >= MAX_TRIES) return setFailed(true);
          setTimeout(() => setAttempt((a) => a + 1), 3000);
        }}
        onError={() => setFailed(true)}
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {size === 'tall' ? 'Taking a snapshot…' : ''}
        </div>
      )}
    </div>
  );
}
