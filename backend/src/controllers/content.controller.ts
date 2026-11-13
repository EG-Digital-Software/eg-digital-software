import type { Request, Response } from 'express';
import * as content from '../services/content.service.js';
import { asyncHandler, ok } from '../utils/http.js';
import { actor, boardCustomer, employeeCustomer, type Resolver } from './social.controller.js';

/**
 * Content Calendar endpoints, mounted on the admin board, the client portal and
 * the team portal like the Social Media Dashboard. Who may do what (team edits
 * and schedules, client/admin approves) is checked in the service.
 */
function handlers(resolve: Resolver) {
  const t = (req: Request) => req.params.taskId;
  const p = (req: Request) => req.params.postId;
  return {
    get: asyncHandler(async (req: Request, res: Response) => ok(res, await content.getCalendar(await resolve(req), t(req), await actor(req)))),
    autoPublish: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await content.setAutoPublish(await resolve(req), t(req), await actor(req), !!req.body?.on), 'Auto-publish updated')
    ),
    create: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await content.createPost(await resolve(req), t(req), await actor(req), req.body ?? {}), 'Post added', 201)
    ),
    update: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await content.updatePost(await resolve(req), t(req), p(req), await actor(req), req.body ?? {}), 'Post saved')
    ),
    remove: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await content.deletePost(await resolve(req), t(req), p(req), await actor(req)), 'Post removed')
    ),
    requestApproval: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await content.requestApproval(await resolve(req), t(req), p(req), await actor(req)), 'Sent for approval')
    ),
    decide: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await content.decide(await resolve(req), t(req), p(req), await actor(req), req.body?.approve === true, req.body?.note), 'Decision saved')
    ),
    schedule: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await content.schedule(await resolve(req), t(req), p(req), await actor(req)), 'Post scheduled')
    ),
    unschedule: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await content.unschedule(await resolve(req), t(req), p(req), await actor(req)), 'Post unscheduled')
    ),
    publishNow: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await content.publishNow(await resolve(req), t(req), p(req), await actor(req)), 'Publishing started')
    ),
  };
}

export const board = handlers(boardCustomer);
export const employee = handlers(employeeCustomer);
