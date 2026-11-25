import { api, request } from '../client';
import { approvalsApi, type PendingUser } from './dashboard';

/**
 * Admin Team endpoints — the same API the web Team dashboard uses
 * (`frontend/src/api/resources.ts` adminApi: registrations, employees, team-roles).
 * Profile edit / password / add live in approvalsApi (shared with Approvals).
 */

export type { PendingUser };

/** Permission key ("billing", "customers.agreement") → level. */
export type AccessLevel = 'view' | 'edit';
export type AccessMap = Record<string, AccessLevel>;

/** Admin-defined team role: a name plus the admin tabs / sub-tabs it grants and at what level. */
export interface TeamRole {
  id: string;
  name: string;
  tabs: string[];
  access: AccessMap;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}

const enc = encodeURIComponent;

export const teamApi = {
  /** Approved team (EMPLOYEE) accounts — the API caps a page at 100, like the web. */
  employees: async () =>
    (await approvalsApi.registrations({ page: 1, pageSize: 100, role: 'EMPLOYEE', status: 'APPROVED' })).items,
  /** Deletes the team login (same call as Approvals → Manage Team). */
  removeEmployee: (id: string) => api.del<unknown>(`/admin/registrations/${enc(id)}`),

  roles: () => api.get<TeamRole[]>('/admin/team-roles'),
  createRole: (body: { name: string; access: AccessMap }) => api.post<TeamRole>('/admin/team-roles', body),
  updateRole: (id: string, body: { name?: string; access?: AccessMap }) =>
    api.patch<TeamRole>(`/admin/team-roles/${enc(id)}`, body),
  deleteRole: (id: string) => api.del<unknown>(`/admin/team-roles/${enc(id)}`),
  setEmployeeRoles: (id: string, roleIds: string[]) =>
    request<{ employeeId: string; roleIds: string[] }>(`/admin/employees/${enc(id)}/roles`, {
      method: 'PUT',
      body: { roleIds },
    }),
};

export const teamKeys = {
  employees: ['team', 'employees'] as const,
  roles: ['team', 'roles'] as const,
};
