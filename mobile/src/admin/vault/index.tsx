import type { AdminRoute } from '../types';
import VaultScreen from './VaultScreen';
import VaultEntryScreen from './VaultEntryScreen';
import VaultFormScreen from './VaultFormScreen';
import VaultLogScreen from './VaultLogScreen';
import VaultSecurityCheckScreen from './VaultSecurityCheckScreen';

/**
 * Password vault routes (root stack). The vault locks when `Vault` is left.
 *   Vault               —                                  PIN gate + logins list
 *   VaultEntry          { id }                             one login
 *   VaultForm           { id?, customerId?, rotate? }      add (no id) / edit / rotate
 *   VaultLog            —                                  full access log
 *   VaultSecurityCheck  —                                  breach + leaked-password check
 */
export const routes: AdminRoute[] = [
  { name: 'Vault', component: VaultScreen },
  { name: 'VaultEntry', component: VaultEntryScreen },
  { name: 'VaultForm', component: VaultFormScreen },
  { name: 'VaultLog', component: VaultLogScreen },
  { name: 'VaultSecurityCheck', component: VaultSecurityCheckScreen },
];
