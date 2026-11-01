import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

/**
 * Invoice queries skip the 30s cache: an unpaid invoice is re-priced on the
 * server whenever a product or a customer's agreed terms change, so opening an
 * invoice (or returning to the tab) always fetches what it bills now.
 */
export const LIVE_INVOICE_QUERY = { staleTime: 0, refetchOnWindowFocus: true } as const;
