import type { AdminRoute } from '../types';
import TeamScreen from './TeamScreen';
import RoleFormScreen from './RoleFormScreen';

/**
 * Team routes (root stack, opened from More):
 *   Team          —            members (add, edit, password, roles, remove) + roles list
 *   TeamRoleForm  { roleId? }  (no id = new role)
 */
export const routes: AdminRoute[] = [
  { name: 'Team', component: TeamScreen },
  { name: 'TeamRoleForm', component: RoleFormScreen },
];
