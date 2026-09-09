import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * ponytail: swapped react-native-mmkv (Nitro Modules, needs a dev client) for
 * AsyncStorage so this runs in plain Expo Go. Costs two things blueprint.md
 * §6.1 built on purpose: the session is no longer encrypted, and writes are
 * async instead of sync-before-next-frame, so a force-quit mid-write can lose
 * data. Fine while there is no real auth; revisit before shipping sign-in.
 */
function namespaced(prefix: string) {
  const k = (key: string) => `${prefix}:${key}`;
  return {
    getString: (key: string): Promise<string | null> => AsyncStorage.getItem(k(key)),
    set: (key: string, value: string): Promise<void> => AsyncStorage.setItem(k(key), value),
    remove: (key: string): Promise<void> => AsyncStorage.removeItem(k(key)),
    clearAll: async (): Promise<void> => {
      const keys = await AsyncStorage.getAllKeys();
      await AsyncStorage.multiRemove(keys.filter((key) => key.startsWith(`${prefix}:`)));
    },
  };
}

/** Supabase session. No longer encrypted — see the ponytail note above. */
export const sessionStore = namespaced('orbit-session');

/** TanStack Query cache — the offline database (Phase 2). */
export const cacheStore = namespaced('orbit-query-cache');

/** Sync bookkeeping — last_sync_at cursor (Phase 2). */
export const metaStore = namespaced('orbit-sync-meta');

/** Local counter for the (not yet wired) Home-Screen Widget. */
export const widgetStore = namespaced('orbit-widget');

/** Wipe every local trace of the current user. Called on sign-out. */
export async function clearLocalData(): Promise<void> {
  await Promise.all([sessionStore.clearAll(), cacheStore.clearAll(), metaStore.clearAll()]);
}
