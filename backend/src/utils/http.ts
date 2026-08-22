import type { NextFunction, Request, Response } from 'express';

/** Consistent success envelope. */
export function ok<T>(res: Response, data: T, message = 'OK', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

/** Wrap async controllers so thrown errors reach the error middleware. */
export function asyncHandler<
  T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export interface PageQuery {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function parsePagination(query: Record<string, unknown>): PageQuery {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated<T>(
  res: Response,
  items: T[],
  total: number,
  page: PageQuery,
  /** Extra meta merged alongside the pagination fields (e.g. a running total). */
  extraMeta?: Record<string, unknown>
) {
  return res.status(200).json({
    success: true,
    message: 'OK',
    data: items,
    meta: {
      page: page.page,
      pageSize: page.pageSize,
      total,
      totalPages: Math.ceil(total / page.pageSize),
      ...extraMeta,
    },
  });
}
