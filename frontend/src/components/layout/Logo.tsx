import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

/**
 * EG Eloma lockup, matching the brand sheet: the hummingbird mark beside
 * "EG Eloma" ("EG" in the brand green gradient, "Eloma" in navy — or white on
 * dark backgrounds) with the "BY ELOMA GROUP" tagline under a fading green
 * rule. Everything scales from the wrapper font-size, so size it via a text-*
 * class (e.g. <Logo className="text-2xl" />). Use `iconOnly` for the mark
 * alone.
 */
export function Logo({
  className,
  iconOnly = false,
  light = false,
}: {
  className?: string;
  iconOnly?: boolean;
  /** Render the light variant (white body / wordmark) for dark backgrounds. */
  light?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-[0.4em] leading-none', className)}>
      <img
        src={light ? brand.iconLight : brand.icon}
        alt={brand.companyName}
        className={cn('w-auto object-contain', iconOnly ? 'h-[1.5em]' : 'h-[2.1em]')}
      />
      {!iconOnly && (
        <span className="inline-flex flex-col">
          <span className="whitespace-nowrap font-semibold tracking-tight">
            <span className="bg-gradient-to-b from-[#5EE0AE] to-[#22A57A] bg-clip-text font-bold text-transparent">
              EG
            </span>{' '}
            <span style={{ color: light ? '#ffffff' : brand.colors.navy }}>Eloma</span>
          </span>
          <span className="mt-[0.18em] flex items-center gap-[0.45em]">
            <span className="h-px min-w-[1.2em] flex-1 bg-gradient-to-r from-transparent to-[#34B98C]" />
            <span
              className={cn(
                'whitespace-nowrap -mr-[0.3em] text-[0.3em] font-medium uppercase leading-none tracking-[0.3em]',
                light ? 'text-[#9aa3b2]' : 'text-slate-500',
              )}
            >
              By Eloma Group
            </span>
          </span>
        </span>
      )}
    </span>
  );
}
