import { QueryClient, onlineManager } from '@tanstack/react-query';
import type { Persister } from '@tanstack/react-query-persist-client';
import * as Network from 'expo-network';

import { cacheStore } from './storage';

/** Carries the HTTP status through the throw, so retry policy can see a 401. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Unwraps a PostgREST response, preserving the status code on failure. */
export function unwrap<T>(res: {
  data: T | null;
  error: { message: string; code?: string } | null;
  status: number;
}): T {
  if (res.error) throw new ApiError(res.error.message, res.status, res.error.code);
  if (res.data === null) throw new ApiError('No data returned', res.status);
  return res.data;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Never evict: this cache IS the offline database, not a speed-up.
      gcTime: Infinity,
      staleTime: 30_000,
      retry: 2,
      // Serve cache and skip the fetch when offline, rather than erroring.
      networkMode: 'offlineFirst',
    },
    mutations: {
      // Pause instead of fail when offline. Paused mutations are what
      // defaultShouldDehydrateMutation persists, which is what survives a
      // force-quit.
      networkMode: 'offlineFirst',
      retry: (count, error) => {
        // A dead session must not burn the retry budget: three 401s would
        // exhaust it and drop the write. useSync refreshes before resuming,
        // and re-auth replays the queue intact (blueprint §5.5).
        if (error instanceof ApiError && error.status === 401) return false;
        return count < 3;
      },
    },
  },
});

/**
 * MMKV is synchronous, so persistence costs no await and the cache is on disk
 * before the next frame — which is what makes a force-quit safe.
 */
export const persister: Persister = {
  persistClient: (client) => {
    cacheStore.set('cache', JSON.stringify(client));
  },
  restoreClient: () => {
    const raw = cacheStore.getString('cache');
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      // A truncated write (killed mid-persist) must not brick startup.
      // Losing the cache is recoverable; failing to boot is not.
      cacheStore.remove('cache');
      return undefined;
    }
  },
  removeClient: () => {
    cacheStore.remove('cache');
  },
};

// Replaces TanStack's default browser listener, which does not exist on native.
// Without this, onlineManager is permanently "online" and mutations never pause
// — they just fail, and the whole offline story silently does nothing.
onlineManager.setEventListener((setOnline) => {
  void Network.getNetworkStateAsync()
    .then((state) => setOnline(state.isInternetReachable ?? false))
    .catch(() => setOnline(false));

  const subscription = Network.addNetworkStateListener((state) => {
    setOnline(state.isInternetReachable ?? false);
  });
  return () => subscription.remove();
});
