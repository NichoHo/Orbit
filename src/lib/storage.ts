import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createMMKV } from 'react-native-mmkv';

const KEY_NAME = 'orbit-mmkv-key';

/**
 * The MMKV encryption key, held in the platform keychain.
 *
 * This is what makes storing the Supabase session in MMKV safe rather than a
 * repeat of the "tokens in AsyncStorage" anti-pattern: MMKV holds ciphertext,
 * and the only secret is 32 bytes in SecureStore — far below the ~2048-byte
 * ceiling that breaks storing the session itself there (blueprint §6.1).
 *
 * A v4 UUID with dashes stripped is exactly 32 hex chars, which is AES-256's
 * key length. Deliberately not `Buffer.from(getRandomBytes(32)).toString('base64')`:
 * Buffer does not exist in React Native, and that string is 44 chars — over
 * MMKV's 32-byte ceiling, so it would throw at startup.
 */
function loadOrCreateKey(): string {
  const existing = SecureStore.getItem(KEY_NAME);
  if (existing) return existing;

  const key = Crypto.randomUUID().replace(/-/g, '');
  SecureStore.setItem(KEY_NAME, key);
  return key;
}

const encryptionKey = loadOrCreateKey();

/** Supabase session. Encrypted — a bearer credential is the high-value target. */
export const sessionStore = createMMKV({
  id: 'orbit-session',
  encryptionKey,
  encryptionType: 'AES-256',
});

/**
 * TanStack Query cache — the offline database (Phase 2).
 * Not encrypted: it is the hot path on every write, and the OS sandbox already
 * covers app-private files. Revisit if Orbit ever stores anything more
 * sensitive than task titles.
 */
export const cacheStore = createMMKV({ id: 'orbit-query-cache' });

/** Sync bookkeeping — last_sync_at cursor (Phase 2). */
export const metaStore = createMMKV({ id: 'orbit-sync-meta' });

/** Shared App Group for Home-Screen Widget */
export const widgetStore = createMMKV({ id: 'orbit-widget' });

/** Wipe every local trace of the current user. Called on sign-out. */
export function clearLocalData(): void {
  sessionStore.clearAll();
  cacheStore.clearAll();
  metaStore.clearAll();
}
