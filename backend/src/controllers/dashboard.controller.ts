import type { Request, Response } from 'express';
import * as dash from '../services/dashboard.service.js';
import { listActivity } from '../services/activity.service.js';
import { asyncHandler, ok } from '../utils/http.js';

const RANGE_MAP: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '6m': 180,
  '12m': 365,
};

export const summary = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await dash.getSummary());
});

export const series = asyncHandler(async (req: Request, res: Response) => {
  const metric = (req.query.metric as string) || 'revenue';
  const range = RANGE_MAP[(req.query.range as string) || '30d'] ?? 30;
  return ok(res, await dash.getSeries(metric, range));
});

export const licences = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await dash.getLicences());
});

export const lowStock = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await dash.getLowStock());
});

export const recentActivity = asyncHandler(async (_req: Request, res: Response) => {
  const [recent, activity] = await Promise.all([dash.getRecent(), listActivity(15)]);
  return ok(res, { ...recent, activity });
});
