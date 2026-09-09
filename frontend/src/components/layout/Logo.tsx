import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

/**
 * EG Digital lockup: the square kangaroo mark + "eg digital" set in the app's
 * own typeface (crisp, normal tracking — not the wide baked wordmark). Both
 * words share the brand navy. Everything scales from the wrapper font-size, so
 * size it via a text-* class (e.g. <Logo className="text-2xl" />). Use
 * `iconOnly` for the square mark alone.
 */
export function Logo({
  className,
  iconOnly = false,
  light = false,
}: {
  className?: string;
  iconOnly?: boolean;
  /** Render the mark + wordmark in white (for dark/photo backgrounds). */
  light?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 leading-none', className)}>
      <img
        src={brand.icon}
        alt={brand.companyName}
        className={cn('h-[1.35em] w-auto object-contain', light && 'brightness-0 invert')}
      />
      {!iconOnly && (
        <span
          className="font-medium lowercase tracking-tight"
          style={{ color: light ? '#ffffff' : brand.colors.navy }}
        >
          eg digital
        </span>
      )}
    </span>
  );
}
