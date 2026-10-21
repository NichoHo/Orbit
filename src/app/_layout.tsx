import '../global.css';

// Side-effect import: registers the task mutation defaults at module scope.
// resumePausedMutations can only rebuild a restored mutation if its default is
// already registered, so this must load before the persist provider restores.
import '@/hooks/use-tasks';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colorScheme, cssInterop } from 'nativewind';
import { useEffect } from 'react';
import { Platform, useColorScheme, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/hooks/use-auth';
import { persister, queryClient } from '@/lib/query';

// NativeWind drops className on reanimated components on web unless they are registered.
cssInterop(Animated.View, { className: 'style' });
cssInterop(Animated.FlatList, { className: 'style' });

export default function RootLayout() {
  const scheme = useColorScheme();
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    colorScheme.set(scheme === 'dark' ? 'dark' : 'light');
    // Backdrop behind the phone-width column on wide screens.
    document.body.style.backgroundColor = scheme === 'dark' ? '#171717' : '#e5e5e5';
  }, [scheme]);

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
          {/* Web demo: phone-width column, centred on desktop. No-op on native (flex:1, no max). */}
          <View style={{ flex: 1, width: '100%', ...(Platform.OS === 'web' && { height: '100dvh' as unknown as number }), maxWidth: Platform.OS === 'web' ? 430 : undefined, alignSelf: 'center', ...(Platform.OS === 'web' && { boxShadow: '0 0 40px rgba(0,0,0,0.25)' }) }}>
            <Stack screenOptions={{ headerShown: false }} />
          </View>
        </SafeAreaProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
