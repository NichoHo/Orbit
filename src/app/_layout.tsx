import '../global.css';

// Side-effect import: registers the task mutation defaults at module scope.
// resumePausedMutations can only rebuild a restored mutation if its default is
// already registered, so this must load before the persist provider restores.
import '@/hooks/use-tasks';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/hooks/use-auth';
import { persister, queryClient } from '@/lib/query';

export default function RootLayout() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      // maxAge Infinity: this cache is the offline database. Expiring it would
      // throw away a user's tasks because they were offline for a fortnight.
      persistOptions={{ persister, maxAge: Infinity }}
    >
      <AuthProvider>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </SafeAreaProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
