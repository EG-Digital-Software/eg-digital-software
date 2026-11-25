import type { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Client-portal sections still in preview (Feedback, Vault) are open only for
 * these clients. Keep in sync with frontend/src/lib/clientPreview.ts.
 */
export const PREVIEW_CLIENT_IDS = ['EGD-2627-5002']; // Demo Test Company

/** Blocks CLIENT users whose company isn't in the preview list. Staff pass through. */
export async function requirePreviewClient(req: Request, _res: Response, next: NextFunction) {
  try {
    if (req.user?.role !== Role.CLIENT) return next();
    const user = await prisma.clientUser.findUnique({
      where: { id: req.user.sub },
      select: { customer: { select: { clientId: true } } },
    });
    const clientId = user?.customer?.clientId;
    if (!clientId || !PREVIEW_CLIENT_IDS.includes(clientId)) {
      return next(ApiError.forbidden('This section is coming soon and is not available on your account yet'));
    }
    next();
  } catch (err) {
    next(err);
  }
}
