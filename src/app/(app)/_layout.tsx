import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';

import { SyncBanner } from '@/components/sync-banner';
import { useAuth } from '@/hooks/use-auth';
import { useSync } from '@/hooks/use-sync';
import { useRealtime } from '@/hooks/use-realtime';

/**
 * The auth gate. One redirect for the whole signed-in tree — no per-screen
 * guards, which is what makes adding a screen a one-file change.
 *
 * useSync lives here for two reasons: the gate above it guarantees a session
 * exists, and mounting it once stops two copies of the reconnect sequence
 * racing each other.
 */
export default function AppLayout() {
  const { session, loading } = useAuth();
  const sync = useSync();
  useRealtime();

  if (loading) return null; // splash stays up
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <View className="flex-1">
      <SyncBanner state={sync} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="task/[id]" options={{ presentation: 'modal' }} />
      </Stack>
    </View>
  );
}
