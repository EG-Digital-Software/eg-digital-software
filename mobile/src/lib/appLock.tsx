import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, Pressable, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth } from '../context/AuthContext';
import { Bird, Btn, Muted, T } from '../ui';
import { colors } from '../theme';

/**
 * App lock: while signed in, ask for Face ID / fingerprint every time the app
 * opens, and when it comes back after more than GRACE_MS in the background.
 * The short grace keeps photo / file pickers (which background the app on
 * Android) from locking mid-task. Per phone, off by default. While it's on, the
 * app switcher preview is hidden too (setSwitcherPrivacy).
 */
const KEY = 'eg.applock.on';
const GRACE_MS = 30_000;

/**
 * Hides the app's preview in the app switcher: a full blur on iOS, the secure
 * window flag on Android (blank preview; it also blocks screenshots there).
 * Builds made before expo-screen-capture was added don't have the native module,
 * so an over-the-air update just skips this instead of crashing.
 */
async function setSwitcherPrivacy(on: boolean) {
  if (!requireOptionalNativeModule('ExpoScreenCapture')) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sc = require('expo-screen-capture') as typeof import('expo-screen-capture');
  try {
    if (Platform.OS === 'ios') {
      if (on) await sc.enableAppSwitcherProtectionAsync(1);
      else await sc.disableAppSwitcherProtectionAsync();
    } else if (on) await sc.preventScreenCaptureAsync('app-lock');
    else await sc.allowScreenCaptureAsync('app-lock');
  } catch {
    // Privacy cover is best effort; the lock itself still works.
  }
}

interface AppLockState {
  enabled: boolean;
  /** Turning it on confirms Face ID / fingerprint first. Throws with a message. */
  setEnabled: (on: boolean) => Promise<void>;
}

const Ctx = createContext<AppLockState>({ enabled: false, setEnabled: async () => undefined });
export const useAppLock = () => useContext(Ctx);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { ready, user, bio } = useAuth();
  const [enabled, setOn] = useState<boolean | null>(null);
  // Starts locked: a session restored at launch must unlock first.
  const [locked, setLocked] = useState(true);
  const awayAt = useRef<number | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((v) => setOn(v === '1'))
      .catch(() => setOn(false));
  }, []);

  // App lock on and signed in: keep the app's content out of the app switcher.
  const guard = !!enabled && !!user;
  useEffect(() => {
    void setSwitcherPrivacy(guard);
  }, [guard]);

  // Signed out: nothing to lock, and a fresh password sign-in shouldn't ask again.
  useEffect(() => {
    if (ready && !user) setLocked(false);
  }, [ready, user]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      // Only 'background' counts: iOS goes 'inactive' for the Face ID prompt itself.
      if (s === 'background') awayAt.current = Date.now();
      else if (s === 'active' && awayAt.current !== null) {
        if (Date.now() - awayAt.current >= GRACE_MS) setLocked(true);
        awayAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  const setEnabled = useCallback(
    async (on: boolean) => {
      if (on) {
        if (!bio.available) throw new Error(`Set up ${bio.label} in your phone’s settings first.`);
        const r = await LocalAuthentication.authenticateAsync({ promptMessage: `Turn on app lock with ${bio.label}` });
        if (!r.success) throw new Error(`${bio.label} was not confirmed.`);
        await SecureStore.setItemAsync(KEY, '1');
      } else {
        await SecureStore.deleteItemAsync(KEY);
      }
      setOn(on);
      setLocked(false);
    },
    [bio.available, bio.label]
  );

  // Until the setting is read, keep a signed-in launch covered (no flash of the portal).
  const show = !!user && locked && enabled !== false;

  return (
    <Ctx.Provider value={{ enabled: !!enabled, setEnabled }}>
      {children}
      {show ? <LockScreen waiting={enabled === null} onUnlock={() => setLocked(false)} /> : null}
    </Ctx.Provider>
  );
}

function LockScreen({ waiting, onUnlock }: { waiting: boolean; onUnlock: () => void }) {
  const { bio, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const done = useRef(onUnlock);
  done.current = onUnlock;

  const unlock = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock EG Eloma' });
      if (r.success) done.current();
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  // Ask straight away when the lock appears (once).
  useEffect(() => {
    if (!waiting) void unlock();
  }, [waiting, unlock]);

  return (
    <Modal visible animationType="none" onRequestClose={() => undefined} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24, paddingBottom: insets.bottom + 24 }}>
        <Bird size={88} />
        {waiting ? null : (
          <>
            <T w="b" size={21} style={{ marginTop: 18 }}>
              EG Eloma is locked
            </T>
            <Muted size={14} style={{ marginTop: 6, textAlign: 'center' }}>
              {failed ? `${bio.label} didn’t match. Try again.` : `Use ${bio.label} to open the app.`}
            </Muted>
            <Btn
              title={`Unlock with ${bio.label}`}
              icon={bio.face ? 'scan-outline' : 'finger-print-outline'}
              loading={busy}
              onPress={() => void unlock()}
              style={{ marginTop: 24, alignSelf: 'stretch', maxWidth: 360, width: '100%' }}
            />
            <Pressable onPress={() => void signOut()} hitSlop={10} style={{ marginTop: 18 }}>
              <T w="s" size={14} color={colors.green}>
                Sign out
              </T>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}
