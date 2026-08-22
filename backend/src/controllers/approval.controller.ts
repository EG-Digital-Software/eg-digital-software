import type { Request, Response } from 'express';
import * as approvalService from '../services/approval.service.js';
import { asyncHandler, ok, parsePagination, paginated } from '../utils/http.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const page = parsePagination(req.query);
  const { items, total, counts } = await approvalService.listRequests({
    ...page,
    status: (req.query.status as never) || undefined,
    role: (req.query.role as never) || undefined,
    search: (req.query.search as string | undefined) || undefined,
  });
  // `count` is kept for the nav badge, which reads the pending tally.
  return paginated(res, items, total, page, { counts, count: counts.PENDING });
});

export const count = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, { count: await approvalService.pendingCount() });
});

export const approve = asyncHandler(async (req: Request, res: Response) => {
  const user = await approvalService.approve(req.params.id, req.user!.sub);
  return ok(res, user, 'Account approved');
});

export const reject = asyncHandler(async (req: Request, res: Response) => {
  const user = await approvalService.reject(req.params.id, req.user!.sub);
  return ok(res, user, 'Account rejected');
});
