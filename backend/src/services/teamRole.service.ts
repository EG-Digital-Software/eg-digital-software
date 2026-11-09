import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { STAFF_TABS, type StaffTab } from '../middleware/staffAccess.js';

const ROLE_SELECT = {
  id: true,
  name: true,
  tabs: true,
  createdAt: true,
  updatedAt: true,
  members: { select: { employeeId: true } },
} as const;

type RoleRow = {
  id: string;
  name: string;
  tabs: string[];
  createdAt: Date;
  updatedAt: Date;
  members: { employeeId: string }[];
};

function shape(r: RoleRow) {
  return {
    id: r.id,
    name: r.name,
    tabs: r.tabs.filter((t): t is StaffTab => (STAFF_TABS as readonly string[]).includes(t)),
    memberIds: r.members.map((m) => m.employeeId),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Keep only known tab keys, de-duplicated, in the canonical order. */
function cleanTabs(tabs: string[]): StaffTab[] {
  const set = new Set(tabs);
  return STAFF_TABS.filter((t) => set.has(t));
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

export async function createRole(input: { name: string; tabs: string[] }) {
  const name = input.name.trim();
  if (!name) throw ApiError.badRequest('Role name is required');
  await assertNameFree(name);
  const row = await prisma.teamRole.create({ data: { name, tabs: cleanTabs(input.tabs) }, select: ROLE_SELECT });
  return shape(row);
}

export async function updateRole(id: string, input: { name?: string; tabs?: string[] }) {
  const existing = await prisma.teamRole.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Role not found');
  const data: { name?: string; tabs?: StaffTab[] } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw ApiError.badRequest('Role name is required');
    await assertNameFree(name, id);
    data.name = name;
  }
  if (input.tabs !== undefined) data.tabs = cleanTabs(input.tabs);
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
