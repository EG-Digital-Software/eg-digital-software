import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

/**
 * EG Digital lockup: kangaroo mark + "eg digital" wordmark.
 * "digital" is rendered in the brand green; there is no ™.
 * Everything scales from the wrapper font-size, so change size via a text-*
 * class (e.g. <Logo className="text-3xl" />). Use `iconOnly` for the mark alone.
 */
export function Logo({
  className,
  iconOnly = false,
}: {
  className?: string;
  iconOnly?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 leading-none', className)}>
      <img
        src={brand.icon}
        alt={brand.companyName}
        className="h-[1.35em] w-auto object-contain"
      />
      {!iconOnly && (
        <span
          className="font-semibold lowercase tracking-tight"
          style={{ color: brand.colors.navy }}
        >
          eg <span style={{ color: brand.colors.green }}>digital</span>
        </span>
      )}
    </span>
  );
}
