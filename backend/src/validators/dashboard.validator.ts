import { z } from 'zod';

/**
 * Chart query. Unrecognised values previously fell back silently — an operator
 * (or a stale bookmark) asking for `metric=profit` got the revenue series with
 * no indication the request was wrong.
 */
export const seriesQuerySchema = z.object({
  metric: z.enum(['revenue', 'sales', 'invoices', 'customers']).optional(),
  range: z.enum(['7d', '30d', '90d', '6m', '12m']).optional(),
});
