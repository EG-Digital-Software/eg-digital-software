import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import * as Updates from 'expo-updates';

/** Don't ask the update server more than once in this window. */
const CHECK_EVERY_MS = 15 * 60 * 1000;

/**
 * Over-the-air updates (EAS Update). The installed app checks for a newer
 * JS bundle on launch and whenever it comes back to the foreground; once one
 * has downloaded, it offers to restart into it (otherwise it loads on the next
 * launch by itself). Does nothing in Expo Go / development builds.
 */
export function useAppUpdates() {
  const lastCheck = useRef(0);
  const asked = useRef(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    const check = async () => {
      if (asked.current || Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
      lastCheck.current = Date.now();
      try {
        const res = await Updates.checkForUpdateAsync();
        if (!res.isAvailable) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (!fetched.isNew) return;
        asked.current = true;
        Alert.alert('Update ready', 'A new version of EG Eloma has been downloaded.', [
          { text: 'Later', style: 'cancel' },
          { text: 'Restart now', onPress: () => void Updates.reloadAsync().catch(() => undefined) },
        ]);
      } catch {
        // Offline or the update server is unreachable — try again next time.
      }
    };

    void check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    return () => sub.remove();
  }, []);
}
