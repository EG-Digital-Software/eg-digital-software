import type { AdminRoute } from '../types';
import SettingsScreen from './SettingsScreen';
import AccessPinsScreen from './AccessPinsScreen';
import AccountSettingsScreen from './AccountSettingsScreen';

/**
 * Settings routes (root stack):
 *   Settings            —                                       organisation settings
 *   SettingsAccessPins  —                                       everyone's Access PINs
 *   AccountSettings     { tab?: 'profile' | 'password' | 'pin' } my account
 */
export const routes: AdminRoute[] = [
  { name: 'Settings', component: SettingsScreen },
  { name: 'SettingsAccessPins', component: AccessPinsScreen },
  { name: 'AccountSettings', component: AccountSettingsScreen },
];
