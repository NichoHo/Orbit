import {
  onlineManager,
  useIsRestoring,
  useMutationState,
} from '@tanstack/react-query';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { queryClient, unwrap } from '@/lib/query';
import { metaStore } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { mergeById } from '@/lib/sync-merge';
import { TASKS_KEY, type Task } from './use-tasks';
import { HABITS_KEY } from './use-habits';
import { HABIT_ENTRIES_KEY } from './use-habit-entries';
import { useAuth } from './use-auth';

export type SyncState =
  | { kind: 'synced' }
  | { kind: 'syncing' }
  /** Expected, not an error. The writes are safe; say so. */
  | { kind: 'offline'; queued: number }
  /** Queue is intact locally and replays after re-auth. Do NOT sign out. */
  | { kind: 'auth-required'; queued: number }
  /** Retries exhausted. The only state where work is genuinely at risk. */
  | { kind: 'failed'; queued: number };

/**
 * Pull everything that changed since the last successful sync.
 *
 * No .eq('user_id', ...) — RLS already scopes this to the caller, and adding a
 * client-side filter would imply the client is the security boundary. The
 * (user_id, updated_at) index is still used, because the policy predicate puts
 * user_id in the WHERE clause.
 */
async function deltaPull(): Promise<void> {
  const since = (await metaStore.getString('last_sync_at')) ?? '1970-01-01T00:00:00.000Z';

  // Five-minute overlap: a transaction can commit after a later-timestamped one,
  // so a strict cursor can skip rows. Re-pulling costs nothing because
  // mergeById is idempotent (proved in sync-merge.test.ts).
  const cursor = new Date(Date.parse(since) - 5 * 60_000).toISOString();

  const [tasks, habits, habitEntries] = await Promise.all([
    supabase.from('tasks').select('*').gt('updated_at', cursor).order('updated_at'),
    supabase.from('habits').select('*').gt('updated_at', cursor).order('updated_at'),
    supabase.from('habit_entries').select('*').gt('updated_at', cursor).order('updated_at')
  ]);

  if (tasks.data) {
    queryClient.setQueryData<Task[]>(TASKS_KEY, (old = []) => mergeById(old, tasks.data));
  }
  if (habits.data) {
    queryClient.setQueryData(HABITS_KEY, (old: any = []) => mergeById(old, habits.data));
  }
  if (habitEntries.data) {
    queryClient.setQueryData(HABIT_ENTRIES_KEY, (old: any = []) => mergeById(old, habitEntries.data));
  }

  await metaStore.set('last_sync_at', new Date().toISOString());
}

function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(() => cb()),
    () => onlineManager.isOnline(),
    () => true,
  );
}

/**
 * Runs the reconnect sequence and reports what the user should be told.
 *
 * Call this once, from the signed-in layout — the auth gate above it guarantees
 * a session exists, and mounting it once avoids two copies racing.
 */
export function useSync(): SyncState {
  const { session } = useAuth();
  const isRestoring = useIsRestoring();
  const online = useOnline();

  const [authRequired, setAuthRequired] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const queued = useMutationState({
    filters: { predicate: (m) => m.state.isPaused },
  }).length;
  const failed = useMutationState({ filters: { status: 'error' } }).length;

  const run = useCallback(async () => {
    if (!session) return;
    setSyncing(true);
    try {
      // 1. Refresh FIRST. A device offline long enough for the refresh token to
      //    expire would otherwise replay its whole queue into 401s and drop
      //    every write. Mutations must never be what discovers a dead session.
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        const status = (error as { status?: number }).status ?? 0;
        // Only a real rejection means re-auth. A transient network failure must
        // not send the user to sign-in — leave the queue paused and retry on
        // the next online event.
        if (status === 400 || status === 401 || status === 403) setAuthRequired(true);
        return;
      }
      setAuthRequired(false);

      // 2. Push local work before pulling, or a stale server row lands on top
      //    of a local edit that has not been sent yet.
      await queryClient.resumePausedMutations();

      // 3. Then reconcile.
      await deltaPull();
    } catch {
      // Transient. The next online transition tries again.
    } finally {
      setSyncing(false);
    }
  }, [session]);

  useEffect(() => {
    // Never resume before the persisted queue has been restored, or the
    // mutations still on disk are skipped.
    if (isRestoring || !session || !online) return;
    void run();
  }, [isRestoring, session, online, run]);

  if (authRequired) return { kind: 'auth-required', queued };
  if (!online) return { kind: 'offline', queued };
  if (failed > 0) return { kind: 'failed', queued: failed };
  if (syncing) return { kind: 'syncing' };
  return { kind: 'synced' };
}
