import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { getSession, refreshSession, request } from '../api/client';

/**
 * Phone notifications. After sign-in the app asks for permission, gets this
 * phone's Expo push token and hands it to the API; the API then pushes every
 * notification and every new chat message here — app open or closed.
 */

/** "Push notifications" switch in Profile — per phone, on by default. */
const PUSH_ON_KEY = 'eg:push:on';
/** The token this phone last registered, so sign-out can remove it. */
const TOKEN_KEY = 'eg:push:token';

// Show notifications as banners even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function pushEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PUSH_ON_KEY)) !== '0';
  } catch {
    return true;
  }
}

export async function setPushEnabled(on: boolean) {
  await AsyncStorage.setItem(PUSH_ON_KEY, on ? '1' : '0').catch(() => undefined);
  if (on) return registerPush({ ask: true });
  await unregisterPush();
  return true;
}

function projectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

/**
 * The account this phone's notifications belong to: the admin themself while
 * they look at a customer's portal (never the customer they're viewing).
 */
function ownToken(): string | null {
  const s = getSession();
  if (!s) return null;
  return s.admin?.accessToken ?? s.accessToken;
}

async function post(path: string, body: unknown) {
  const s = getSession();
  if (s?.admin) {
    // The session token is the "view as client" one; register as the admin.
    const send = () =>
      fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: { 'X-Client': 'mobile', 'Content-Type': 'application/json', Authorization: `Bearer ${ownToken()}` },
        body: JSON.stringify(body),
      });
    let res = await send();
    // The admin's own access token expires while they look at a customer: refresh it once.
    if (res.status === 401 && (await refreshSession()) && getSession()?.admin) res = await send();
    if (!res.ok) throw new Error(`Push registration failed (${res.status})`);
    return;
  }
  await request(path, { method: 'POST', body });
}

/**
 * Register this phone for push. Returns false when it can't (simulator, no
 * permission, or the app isn't linked to an Expo project yet).
 */
export async function registerPush({ ask = true }: { ask?: boolean } = {}): Promise<boolean> {
  try {
    if (!getSession() || !(await pushEnabled())) return false;
    if (!Device.isDevice) return false;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Messages and updates',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 200, 120, 200],
        lightColor: '#2DB98A',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return false;

    const id = projectId();
    if (!id) {
      console.warn('Push: no EAS projectId in app.json (run `eas init`) — skipping registration.');
      return false;
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    await post('/notifications/devices', { token, platform: Platform.OS });
    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => undefined);
    return true;
  } catch (e) {
    console.warn('Push registration failed', e);
    return false;
  }
}

/** Stop pushes to this phone (sign-out or switched off). Best effort. */
export async function unregisterPush() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    if (getSession()) await post('/notifications/devices/remove', { token }).catch(() => undefined);
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // Signing out still works; the API drops dead tokens on its own.
  }
}

/** Where a tapped notification should open. */
export type PushTarget =
  | { name: 'Thread'; params: { taskId: string; clientId?: string } }
  | { name: 'Main'; params: { screen: string; params?: object } }
  | { name: 'Notifications' };

export function targetOf(data: Record<string, unknown> | undefined): PushTarget | null {
  const type = String(data?.type ?? '');
  // "New feature" announcements have no screen of their own: just open the app.
  if (type === 'FEATURE_UPDATE') return null;
  const entityType = String(data?.entityType ?? '').toLowerCase();
  const id = typeof data?.entityId === 'string' ? data.entityId : '';
  const clientId = typeof data?.clientId === 'string' ? data.clientId : undefined;
  if (entityType === 'task' && id) return { name: 'Thread', params: { taskId: id, clientId } };
  if (entityType === 'document' || type === 'AGREEMENT') return { name: 'Main', params: { screen: 'Agreements' } };
  if (entityType === 'invoice' || /invoice/i.test(type)) {
    return { name: 'Main', params: { screen: 'More', params: { screen: 'Invoices', initial: false } } };
  }
  return { name: 'Notifications' };
}
