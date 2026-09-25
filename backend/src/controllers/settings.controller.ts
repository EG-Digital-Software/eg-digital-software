import type { Request, Response } from 'express';
import * as settingsService from '../services/settings.service.js';
import { asyncHandler, ok } from '../utils/http.js';
import { emailStatus } from '../services/email/index.js';

/**
 * Whether outgoing email is actually deliverable, and why not when it is not.
 * Exposes no credentials — only the provider name, the From header and the
 * misconfiguration reason — so an admin can see at a glance why an invoice never
 * reached a customer instead of having to read the App Service log stream.
 */
export const getEmailStatus = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, emailStatus());
});

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

export const getAccountManager = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await settingsService.getAccountManagerSetting());
});

export const updateAccountManager = asyncHandler(async (req: Request, res: Response) => {
  const updated = await settingsService.updateAccountManagerSetting(req.body.employeeId ?? null);
  return ok(res, updated, 'Account manager updated');
});
