import type { Request, Response } from 'express';
import { ActivityAction } from '@prisma/client';
import * as authService from '../services/auth.service.js';
import { logActivity } from '../services/activity.service.js';
import { asyncHandler, ok } from '../utils/http.js';
import { env } from '../config/env.js';
import { durationToMs } from '../utils/tokens.js';
import { ApiError } from '../utils/ApiError.js';
import { storage } from '../services/storage/index.js';

const REFRESH_COOKIE = 'eg_refresh';

// In production the SPA (Static Web Apps) and the API (App Service) live on
// different domains, so the refresh cookie is sent cross-site. A browser only
// includes a cross-site cookie when it is `SameSite=None; Secure` — with the
// old `Lax` the cookie was dropped on the /auth/refresh XHR, so every reload
// (and the logout revoke) silently failed and logged the user out. Locally
// (same-site http://localhost) `Lax` is correct since `None` requires Secure.
//
// Detect the cross-site deployment from CORS_ORIGIN (an https origin) rather
// than NODE_ENV, which Azure App Service does not set by default.
const crossSite = env.CORS_ORIGIN.split(',').some((o) => o.trim().startsWith('https://'));
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: crossSite,
  sameSite: (crossSite ? 'none' : 'lax') as 'none' | 'lax',
  path: '/api/auth',
};

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    ...REFRESH_COOKIE_OPTS,
    maxAge: durationToMs(env.JWT_REFRESH_EXPIRES),
  });
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, portal } = req.body;
  const result = await authService.login(email, password, portal);
  setRefreshCookie(res, result.refreshToken);
  logActivity({
    userId: result.user.id,
    userType: result.user.role,
    action: ActivityAction.LOGIN,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  });
  return ok(res, { user: result.user, accessToken: result.accessToken }, 'Logged in');
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.registerUser({
    ...req.body,
    avatar: req.file ? { buffer: req.file.buffer, mimetype: req.file.mimetype } : undefined,
  });
  return ok(
    res,
    { pending: true, email: user.email },
    'Registration submitted — awaiting Admin approval',
    201
  );
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;
  const result = await authService.refresh(token);
  setRefreshCookie(res, result.refreshToken);
  return ok(res, { user: result.user, accessToken: result.accessToken }, 'Token refreshed');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  await authService.logout(token);
  if (req.user) {
    logActivity({
      userId: req.user.sub,
      userType: req.user.role,
      action: ActivityAction.LOGOUT,
      ipAddress: req.ip,
    });
  }
  // Clear with the SAME attributes it was set with, or the browser keeps it.
  res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTS);
  return ok(res, null, 'Logged out');
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.me(req.user!.role, req.user!.sub);
  return ok(res, user);
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.updateProfile(req.user!.role, req.user!.sub, req.body);
  return ok(res, user, 'Profile updated');
});

const AVATAR_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const uploadAvatar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No file uploaded (field name: avatar)');
  const ext = AVATAR_EXT[req.file.mimetype];
  if (!ext) throw ApiError.badRequest('Unsupported image type. Use PNG, JPG, WEBP or GIF.');
  const key = `avatars/${req.user!.sub}-${Date.now()}.${ext}`;
  const url = await storage.save(key, req.file.buffer, req.file.mimetype);
  const user = await authService.setAvatar(req.user!.role, req.user!.sub, url);
  return ok(res, user, 'Profile picture updated');
});

export const removeAvatar = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.setAvatar(req.user!.role, req.user!.sub, null);
  return ok(res, user, 'Profile picture removed');
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.changePassword(
    req.user!.role,
    req.user!.sub,
    req.body.currentPassword,
    req.body.newPassword
  );
  // Every previous refresh token is now revoked, so this device needs the new
  // one — otherwise changing your password logged you out of your own session.
  setRefreshCookie(res, result.refreshToken);
  return ok(
    res,
    {
      user: result.user,
      accessToken: result.accessToken,
      sessionsRevoked: result.sessionsRevoked,
    },
    'Password updated'
  );
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.forgotPassword(req.body.email, req.body.portal);
  return ok(res, null, 'If an account exists, a reset link has been sent');
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body.token, req.body.password);
  return ok(res, null, 'Password has been reset');
});
