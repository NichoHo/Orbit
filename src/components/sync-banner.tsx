import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { queryClient } from '@/lib/query';
import type { SyncState } from '@/hooks/use-sync';

const plural = (n: number) => `${n} change${n === 1 ? '' : 's'}`;

/**
 * The only place sync is visible to the user. Correct sync that nobody can
 * observe is indistinguishable from broken sync.
 *
 * Renders nothing while synced or syncing — a banner that flashes on every
 * round trip reads as instability and undercuts the point of optimistic writes.
 */
export function SyncBanner({ state }: { state: SyncState }) {
  if (state.kind === 'synced' || state.kind === 'syncing') return null;

  // Expected state, not an error. The writes are safe, so the styling says so
  // rather than alarming someone who simply walked into a lift.
  if (state.kind === 'offline') {
    return (
      <View className="bg-neutral-200 px-4 py-2 dark:bg-neutral-800">
        <Text className="text-center text-sm text-neutral-700 dark:text-neutral-300">
          {state.queued > 0
            ? `Offline — ${plural(state.queued)} saved on this device`
            : 'Offline'}
        </Text>
      </View>
    );
  }

  // Queue is intact locally. Route to sign-in; do NOT sign out, which would
  // clear the cache and destroy exactly the writes we are trying to save.
  if (state.kind === 'auth-required') {
    return (
      <Pressable
        onPress={() => router.push('/sign-in')}
        accessibilityRole="button"
        className="min-h-11 justify-center bg-amber-500 px-4 py-2"
      >
        <Text className="text-center text-sm font-medium text-white">
          Sign in to sync {plural(state.queued)} · Tap to continue
        </Text>
      </Pressable>
    );
  }

  // The one state where work is genuinely at risk, so it is loud and actionable.
  // A failure visible only in a log is the same as data loss.
  return (
    <Pressable
      onPress={() => void queryClient.resumePausedMutations()}
      accessibilityRole="button"
      className="min-h-11 justify-center bg-red-600 px-4 py-2"
    >
      <Text className="text-center text-sm font-medium text-white">
        {plural(state.queued)} failed to sync · Tap to retry
      </Text>
    </Pressable>
  );
}
