import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import type { Database } from '@/types/supabase';
import { sessionStore } from './storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Fail loudly at startup rather than with an opaque network error later.
// EXPO_PUBLIC_* vars are inlined at build time, so a missing one is a build
// problem, not a runtime one — surface it immediately.
if (!url || !publishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Check .env, then restart the dev server (env vars are inlined at build time).',
  );
}

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    storage: {
      getItem: (key) => sessionStore.getString(key) ?? null,
      setItem: (key, value) => sessionStore.set(key, value),
      // react-native-mmkv v4 renamed delete() to remove().
      removeItem: (key) => {
        sessionStore.remove(key);
      },
    },
    autoRefreshToken: true,
    persistSession: true,
    // Native has no URL bar to read a session out of.
    detectSessionInUrl: false,
  },
});

// React Native does not run timers reliably in the background. Without this the
// access token silently expires and every request 401s after a while.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
