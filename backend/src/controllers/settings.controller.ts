import type { Request, Response } from 'express';
import * as settingsService from '../services/settings.service.js';
import { asyncHandler, ok } from '../utils/http.js';

export const getPayment = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await settingsService.getPaymentSettings());
});

export const updatePayment = asyncHandler(async (req: Request, res: Response) => {
  const updated = await settingsService.updatePaymentSettings(req.body);
  return ok(res, updated, 'Payment settings saved');
});

export const getPublicPayment = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await settingsService.getPublicPaymentSettings());
});

export const getOrganisation = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await settingsService.getOrganisationSettings());
});

export const updateOrganisation = asyncHandler(async (req: Request, res: Response) => {
  const updated = await settingsService.updateOrganisationSettings(req.body);
  return ok(res, updated, 'Organisation settings saved');
});

/**
 * Public read for the invoice and pay page — the issuing entity is printed on
 * every invoice, so it is not secret.
 */
export const getPublicOrganisation = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await settingsService.getOrganisationSettings());
});
