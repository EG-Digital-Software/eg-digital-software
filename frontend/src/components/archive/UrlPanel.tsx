import { SiteFrame, type FrameBadgeTone } from '@/components/archive/SiteFrame';
import { SiteShot } from '@/components/archive/SiteShot';
import { joinSitePath, siteHostOf, useFrameable } from '@/lib/siteLinks';

/**
 * A website given as a link, opened live. A site that refuses to be shown
 * inside other pages (X-Frame-Options / CSP) can't load in a frame at all, so
 * for those its screenshot is shown instead, with a way to open it in a new tab.
 */
export function UrlPanel({
  url,
  path = '/',
  badge,
  height,
}: {
  url: string;
  path?: string;
  badge: { tone: FrameBadgeTone; label: string };
  height: number | string;
}) {
  const target = joinSitePath(url, path);
  const address = `${siteHostOf(url)}${path}`;
  const frame = useFrameable(url);
  if (frame.data?.frameable) {
    return <SiteFrame src={target} address={`${address} · live`} leadingBadge={badge} live height={height} />;
  }
  if (frame.isLoading) {
    return (
      <SiteFrame address={`${address} · live`} leadingBadge={badge} openUrl={target} height={height}>
        <div className="flex h-full items-center justify-center text-sm text-slate-500">Opening the website…</div>
      </SiteFrame>
    );
  }
  return (
    <SiteFrame address={address} leadingBadge={badge} openUrl={target} height={height}>
      <div className="flex h-full flex-col overflow-auto bg-white">
        <div className="bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900">
          {frame.data && !frame.data.reachable
            ? 'The site could not be reached — showing its last picture.'
            : 'This site doesn’t allow being opened inside other pages — showing its picture. Use the arrow above to open it live.'}
        </div>
        <SiteShot key={target} url={target} size="tall" className="min-h-[200px]" alt={address} />
      </div>
    </SiteFrame>
  );
}
