import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import * as taskService from '../services/task.service.js';
import * as clientService from '../services/client.service.js';
import * as social from '../services/social/social.service.js';
import { findById } from '../services/accounts.js';
import { asyncHandler, ok } from '../utils/http.js';

/**
 * Social Media Dashboard endpoints, mounted on the admin board
 * (/customers/:clientId/tasks), the client portal (/client/tasks) and the team
 * portal (/employee/tasks). Only the way the customer is found differs.
 */

export type Resolver = (req: Request) => Promise<string>;

/** Admin board (customer in the path) or client portal (customer of the signed-in client). */
export const boardCustomer: Resolver = async (req) => {
  if (req.params.clientId) return taskService.resolveCustomerId(req.params.clientId);
  if (req.user?.cid) return req.user.cid;
  return clientService.resolveCustomerId(req.user!.sub);
};

/** Team portal: the customer of a task this team member is assigned to. */
export const employeeCustomer: Resolver = (req) => taskService.resolveEmployeeTaskCustomer(req.user!.sub, req.params.taskId);

export async function actor(req: Request): Promise<social.Actor> {
  const { sub, role, email } = req.user!;
  const acc = await findById(role, sub);
  return { id: sub, type: role, name: acc ? `${acc.firstName} ${acc.lastName}`.trim() : email };
}

function handlers(resolve: Resolver) {
  return {
    get: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await social.getDashboard(await resolve(req), req.params.taskId, await actor(req)))
    ),
    save: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await social.saveDashboard(await resolve(req), req.params.taskId, await actor(req), req.body ?? {}), 'Dashboard saved')
    ),
    saveMetrics: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await social.saveMetrics(await resolve(req), req.params.taskId, await actor(req), req.body?.rows), 'Figures saved')
    ),
    sync: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await social.syncCustomer(await resolve(req), req.params.taskId, await actor(req)))
    ),
    connect: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await social.startConnect(await resolve(req), req.params.taskId, await actor(req), req.params.provider))
    ),
    select: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await social.selectAssets(await resolve(req), req.params.taskId, req.params.connectionId, req.body ?? {}), 'Accounts updated')
    ),
    disconnect: asyncHandler(async (req: Request, res: Response) =>
      ok(res, await social.disconnect(await resolve(req), req.params.taskId, req.params.connectionId), 'Account disconnected')
    ),
  };
}

export const board = handlers(boardCustomer);
export const employee = handlers(employeeCustomer);

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Meta sends the customer back here after they sign in. Public: the signed `state` identifies them. */
export const metaCallback = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const result = await social.completeMetaConnect(q.code, q.state, q.error);
  const nonce = crypto.randomBytes(16).toString('base64');
  res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'`);
  res.setHeader('Cache-Control', 'no-store');
  res.status(result.ok ? 200 : 400).type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${result.ok ? 'Connected' : 'Not connected'}</title>
<style>body{font-family:Manrope,"Segoe UI",Arial,sans-serif;background:#f6f8f7;color:#2f3237;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
.box{background:#fff;border:1px solid #e6efeb;border-radius:12px;padding:28px 32px;max-width:440px;text-align:center}
h1{font-size:20px;margin:0 0 8px;color:${result.ok ? '#1f9a72' : '#c2522d'}}p{font-size:14px;line-height:1.55;margin:0 0 18px}
button{border:0;border-radius:8px;background:#0b213a;color:#fff;font:600 13px inherit;padding:10px 18px;cursor:pointer}</style></head>
<body><div class="box"><h1>${result.ok ? 'Account connected' : 'Not connected'}</h1><p>${escapeHtml(result.message)}</p><button id="c">Close window</button></div>
<script nonce="${nonce}">document.getElementById('c').onclick=function(){window.close()};${result.ok ? 'setTimeout(function(){window.close()},2500);' : ''}</script></body></html>`);
});
