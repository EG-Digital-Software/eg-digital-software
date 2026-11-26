import type { Request, Response } from 'express';
import * as notificationService from '../services/notification.service.js';
import * as pushService from '../services/push.service.js';
import { asyncHandler, ok } from '../utils/http.js';
import { ApiError } from '../utils/ApiError.js';

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

/** The signed-in user's account — never an admin's "view as client" token. */
function pushUser(req: Request) {
  if (req.user?.imp || req.user?.demo) throw ApiError.badRequest('Sign in as yourself to receive notifications on this phone');
  return { userId: req.user!.sub, userType: req.user!.role };
}

const tokenOf = (req: Request) => (typeof req.body?.token === 'string' ? req.body.token.trim() : '');

/** A phone with the mobile app registers its Expo push token after sign-in. */
export const registerDevice = asyncHandler(async (req: Request, res: Response) => {
  const token = tokenOf(req);
  if (!token) throw ApiError.badRequest('Missing push token');
  const platform = typeof req.body?.platform === 'string' ? req.body.platform.slice(0, 20) : undefined;
  try {
    await pushService.registerDevice(pushUser(req), token, platform);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw ApiError.badRequest('Invalid push token');
  }
  return ok(res, null, 'Notifications enabled on this device');
});

/** Sign-out / notifications turned off: stop pushing to this phone. */
export const unregisterDevice = asyncHandler(async (req: Request, res: Response) => {
  const token = tokenOf(req);
  if (token) await pushService.unregisterDevice(pushUser(req), token);
  return ok(res, null, 'Notifications turned off on this device');
});
