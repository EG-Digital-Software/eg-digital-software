import type { Request, Response } from 'express';
import * as report from '../services/report.service.js';
import { asyncHandler, ok } from '../utils/http.js';
import { actor, boardCustomer, employeeCustomer, type Resolver } from './social.controller.js';

/**
 * SEO Dashboard, Local Listing and Azure Performance endpoints, mounted on the
 * admin board, the client portal and the team portal like the Social Media
 * Dashboard. Clients read; only the admin/team save (checked in the service).
 */
function handlers(resolve: Resolver) {
  return {
    get: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await report.getReport(await resolve(req), req.params.taskId, req.params.kind, await actor(req)))
    ),
    save: asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await report.saveReport(await resolve(req), req.params.taskId, req.params.kind, await actor(req), req.body ?? {}),
        'Report saved'
      )
    ),
  };
}

export const board = handlers(boardCustomer);
export const employee = handlers(employeeCustomer);
