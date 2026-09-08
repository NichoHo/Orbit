import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

/**
 * Magic-link sign-in, using the 6-digit code rather than the emailed URL.
 *
 * Supabase sends both. Taking the code means Phase 1 needs no deep-link scheme,
 * no associated domains, and no URL handler — that whole config is what Google
 * and Apple sign-in will force, and it is deferred until then (blueprint §10b).
 * signInWithOtp creates the user if they do not exist, so this is sign-up too.
 */
export default function SignInScreen() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const address = email.trim().toLowerCase();
    if (!address.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }

    setBusy(true);
    setError(null);
    const { error: sendError } = await supabase.auth.signInWithOtp({ email: address });
    setBusy(false);

    if (sendError) {
      setError(sendError.message);
      return;
    }
    setEmail(address);
    setStep('code');
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    // On success onAuthStateChange fires, the gate in (auth)/_layout redirects,
    // and this screen unmounts. Nothing to do here.
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);

    if (verifyError) setError(verifyError.message);
  }

  const onEmailStep = step === 'email';

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center px-6"
      >
        <View className="gap-2">
          <Text className="text-4xl font-bold text-neutral-900 dark:text-neutral-50">
            Orbit
          </Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            {onEmailStep
              ? 'Enter your email and we will send you a code.'
              : `We sent a 6-digit code to ${email}.`}
          </Text>
        </View>

        <View className="mt-8 gap-3">
          {onEmailStep ? (
            <TextInput
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={() => void sendCode()}
              placeholder="you@example.com"
              accessibilityLabel="Email address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="send"
              editable={!busy}
              className="rounded-xl border border-neutral-300 px-4 py-4 text-base text-neutral-900 dark:border-neutral-700 dark:text-neutral-50"
            />
          ) : (
            <TextInput
              value={code}
              onChangeText={setCode}
              onSubmitEditing={() => void verifyCode()}
              placeholder="123456"
              accessibilityLabel="Six digit code"
              autoComplete="one-time-code"
              keyboardType="number-pad"
              returnKeyType="go"
              maxLength={6}
              autoFocus
              editable={!busy}
              className="rounded-xl border border-neutral-300 px-4 py-4 text-center text-2xl tracking-[8px] text-neutral-900 dark:border-neutral-700 dark:text-neutral-50"
            />
          )}

          <Pressable
            onPress={() => void (onEmailStep ? sendCode() : verifyCode())}
            disabled={busy}
            accessibilityRole="button"
            // min-h-14 keeps the target above the 44pt minimum.
            className="min-h-14 items-center justify-center rounded-xl bg-neutral-900 px-4 disabled:opacity-50 dark:bg-neutral-50"
          >
            {busy ? (
              <ActivityIndicator />
            ) : (
              <Text className="text-base font-semibold text-white dark:text-neutral-900">
                {onEmailStep ? 'Send code' : 'Sign in'}
              </Text>
            )}
          </Pressable>

          {!onEmailStep && (
            <Pressable
              onPress={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
              disabled={busy}
              accessibilityRole="button"
              className="min-h-11 items-center justify-center"
            >
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                Use a different email
              </Text>
            </Pressable>
          )}

          {error && (
            <Text
              accessibilityRole="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
