import type { Request, Response } from 'express';
import * as teamRoleService from '../services/teamRole.service.js';
import { accessTabs, employeeAccess } from '../middleware/staffAccess.js';
import { asyncHandler, ok } from '../utils/http.js';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await teamRoleService.listRoles());
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await teamRoleService.createRole(req.body), 'Role created', 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await teamRoleService.updateRole(req.params.id, req.body), 'Role updated');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await teamRoleService.deleteRole(req.params.id);
  return ok(res, null, 'Role deleted');
});

export const setEmployeeRoles = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await teamRoleService.setEmployeeRoles(req.params.id, req.body.roleIds), 'Roles updated');
});

/** The signed-in team member's granted admin tabs and levels (merge of their roles). */
export const myAccess = asyncHandler(async (req: Request, res: Response) => {
  const access = await employeeAccess(req.user!.sub);
  return ok(res, { tabs: accessTabs(access), access });
});
