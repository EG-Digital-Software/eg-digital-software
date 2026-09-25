import type { Request, Response } from 'express';
import * as sectionSeen from '../services/sectionSeen.service.js';
import * as tabActivity from '../services/tabActivity.service.js';
import { asyncHandler, ok } from '../utils/http.js';

/** Current viewer's acknowledged signatures, plus server-computed signatures for
 *  the sidebar tabs so tab dots reflect real data changes (not just what's on
 *  screen). The client merges these with its own on-page signatures. */
export const state = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const [seen, tabs] = await Promise.all([
    sectionSeen.getSeen(userId),
    tabActivity.tabSignatures(req.user!.sub, req.user!.role, req.user!.cid),
  ]);
  return ok(res, { seen, tabs });
});

export const mark = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { items?: { key: string; sig: string }[]; key?: string; sig?: string };
  const items = Array.isArray(body.items)
    ? body.items
    : body.key
      ? [{ key: body.key, sig: body.sig ?? '' }]
      : [];
  await sectionSeen.markSeen(req.user!.sub, items);
  return ok(res, null, 'Acknowledged');
});
