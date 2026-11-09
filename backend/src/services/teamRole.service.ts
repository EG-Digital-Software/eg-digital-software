import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { Prisma } from '@prisma/client';
import { accessTabs, cleanAccess, roleAccess, STAFF_TABS, type AccessMap } from '../middleware/staffAccess.js';

const ROLE_SELECT = {
  id: true,
  name: true,
  tabs: true,
  access: true,
  createdAt: true,
  updatedAt: true,
  members: { select: { employeeId: true } },
} as const;

type RoleRow = {
  id: string;
  name: string;
  tabs: string[];
  access: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  members: { employeeId: string }[];
};

function shape(r: RoleRow) {
  const access = roleAccess(r);
  return {
    id: r.id,
    name: r.name,
    tabs: accessTabs(access),
    access,
    memberIds: r.members.map((m) => m.employeeId),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/**
 * What a create/update grants. `access` (per tab / sub-tab levels) wins; a bare
 * `tabs` list — the older shape — grants those tabs at edit level.
 */
function grantFrom(input: { tabs?: string[]; access?: Record<string, string> }): { tabs: string[]; access: AccessMap } {
  let access: AccessMap;
  if (input.access) access = cleanAccess(input.access);
  else {
    const tabs = new Set(input.tabs ?? []);
    access = roleAccess({ tabs: STAFF_TABS.filter((t) => tabs.has(t)), access: null });
  }
  return { tabs: accessTabs(access), access };
}

async function assertNameFree(name: string, exceptId?: string) {
  const clash = await prisma.teamRole.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw ApiError.badRequest('A role with that name already exists');
}

export async function listRoles() {
  const rows = await prisma.teamRole.findMany({ select: ROLE_SELECT, orderBy: { name: 'asc' } });
  return rows.map(shape);
}

type GrantInput = { tabs?: string[]; access?: Record<string, string> };

export async function createRole(input: { name: string } & GrantInput) {
  const name = input.name.trim();
  if (!name) throw ApiError.badRequest('Role name is required');
  await assertNameFree(name);
  const row = await prisma.teamRole.create({ data: { name, ...grantFrom(input) }, select: ROLE_SELECT });
  return shape(row);
}

export async function updateRole(id: string, input: { name?: string } & GrantInput) {
  const existing = await prisma.teamRole.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Role not found');
  const data: { name?: string; tabs?: string[]; access?: AccessMap } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw ApiError.badRequest('Role name is required');
    await assertNameFree(name, id);
    data.name = name;
  }
  if (input.tabs !== undefined || input.access !== undefined) Object.assign(data, grantFrom(input));
  const row = await prisma.teamRole.update({ where: { id }, data, select: ROLE_SELECT });
  return shape(row);
}

/** Removes the role and its assignments only — team members themselves are untouched. */
export async function deleteRole(id: string) {
  const existing = await prisma.teamRole.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Role not found');
  await prisma.teamRole.delete({ where: { id } });
}

/** Replace the set of roles a team member holds. */
export async function setEmployeeRoles(employeeId: string, roleIds: string[]) {
  const emp = await prisma.employeeUser.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!emp) throw ApiError.notFound('Team member not found');
  const ids = [...new Set(roleIds)];
  if (ids.length) {
    const found = await prisma.teamRole.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw ApiError.badRequest('One or more roles no longer exist');
  }
  await prisma.$transaction([
    prisma.employeeTeamRole.deleteMany({ where: { employeeId, roleId: { notIn: ids } } }),
    prisma.employeeTeamRole.createMany({
      data: ids.map((roleId) => ({ employeeId, roleId })),
      skipDuplicates: true,
    }),
  ]);
  return { employeeId, roleIds: ids };
}
