import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/lib/supabase';
import { clearLocalData } from '@/lib/storage';

type AuthValue = {
  session: Session | null;
  /** True until the persisted session has been read. Gates render the splash. */
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

/**
 * profiles.timezone is written here and nowhere else. The default of 'UTC' is a
 * fallback, not the expected value — the Phase 4 summary cron reads this column
 * to decide when a user's day ends, so leaving it unset silently delivers every
 * user's "daily" summary at 21:00 UTC.
 */
async function syncTimezone(userId: string): Promise<void> {
  // Hermes' Intl support varies by platform; if it yields nothing, the column
  // keeps its 'UTC' default rather than being written with garbage.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!timezone) return;

  const { error } = await supabase.from('profiles').update({ timezone }).eq('id', userId);
  if (error) console.warn('[orbit] could not sync timezone:', error.message);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Reads the persisted session out of MMKV. Resolves offline.
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      setLoading(false);
      if (event === 'SIGNED_IN' && next) void syncTimezone(next.user.id);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
        // Without this the next account on this device sees the previous user's
        // data. From Phase 2 on, this also discards queued writes — the caller
        // must confirm first when the sync queue is non-empty (blueprint §5.8).
        clearLocalData();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
