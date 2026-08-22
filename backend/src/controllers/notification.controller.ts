import type { Request, Response } from 'express';
import * as notificationService from '../services/notification.service.js';
import { asyncHandler, ok } from '../utils/http.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await notificationService.list(req.user!.sub));
});

export const count = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, { unread: await notificationService.unreadCount(req.user!.sub) });
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  await notificationService.markRead(req.user!.sub, req.params.id);
  return ok(res, null, 'Marked as read');
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  await notificationService.markAllRead(req.user!.sub);
  return ok(res, null, 'All marked as read');
});
