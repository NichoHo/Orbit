import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/hooks/use-auth';

/** Mirror of the app gate: a signed-in user has no business on /sign-in. */
export default function AuthLayout() {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (session) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
