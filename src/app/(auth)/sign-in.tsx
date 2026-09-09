import { Ionicons } from '@expo/vector-icons';
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
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

// Supabase's default OTP is 6 digits; this project's mailer is actually
// sending 8. Matching the length here is simpler than hunting down why.
const CODE_LENGTH = 8;

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
  const [focused, setFocused] = useState(false);

  async function sendCode() {
    const address = email.trim().toLowerCase();
    if (!address.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }

    setBusy(true);
    setError(null);
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        // Create the account on first sign-in (this is also sign-up).
        shouldCreateUser: true,
        // Only controls where {{ .ConfirmationURL }} points if the link is
        // ever clicked, not whether a code is sent. The Magic Link template
        // in the dashboard must include {{ .Token }} for the email to show
        // a code at all (Auth > Email Templates > Magic Link).
        emailRedirectTo: undefined,
      },
    });
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
        <Animated.View entering={FadeInDown.duration(450)} className="items-center gap-2">
          {/* Concentric rings around the mark: the app is Orbit, so its own
              wordmark takes the shape of what it's named after. */}
          <View className="mb-2 items-center justify-center rounded-full border border-blue-500/15 dark:border-blue-400/20 h-28 w-28">
            <View className="items-center justify-center rounded-full border border-blue-500/25 dark:border-blue-400/30 h-20 w-20">
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-blue-600">
                <Ionicons name="planet-outline" size={26} color="#fff" />
              </View>
            </View>
          </View>

          <Text className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">
            Orbit
          </Text>
          <Text className="text-center text-base text-neutral-500 dark:text-neutral-400">
            {onEmailStep
              ? 'Enter your email and we will send you a code.'
              : `We sent a ${CODE_LENGTH}-digit code to ${email}.`}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(450).delay(80)} className="mt-8 gap-3">
          {onEmailStep ? (
            <TextInput
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={() => void sendCode()}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="you@example.com"
              accessibilityLabel="Email address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="send"
              editable={!busy}
              // NativeWind's text-* classes set both fontSize AND lineHeight.
              // On iOS, that lineHeight becomes a hard clip boundary that cuts
              // descenders (g, p, y, @). Moving fontSize into style (no lineHeight)
              // lets iOS use its native metrics which handle descenders correctly.
              style={{ fontSize: 16 }}
              className={`rounded-xl border-2 px-4 py-4 text-neutral-900 dark:text-neutral-50 ${
                focused ? 'border-blue-600' : 'border-neutral-300 dark:border-neutral-700'
              }`}
            />
          ) : (
            <TextInput
              value={code}
              onChangeText={setCode}
              onSubmitEditing={() => void verifyCode()}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={'0'.repeat(CODE_LENGTH)}
              accessibilityLabel="Verification code"
              autoComplete="one-time-code"
              keyboardType="number-pad"
              returnKeyType="go"
              maxLength={CODE_LENGTH}
              autoFocus
              editable={!busy}
              style={{ fontSize: 24 }}
              className={`rounded-xl border-2 px-4 py-4 text-center tracking-[8px] text-neutral-900 dark:text-neutral-50 ${
                focused ? 'border-blue-600' : 'border-neutral-300 dark:border-neutral-700'
              }`}
            />
          )}

          <Pressable
            onPress={() => void (onEmailStep ? sendCode() : verifyCode())}
            disabled={busy}
            accessibilityRole="button"
            // min-h-14 keeps the target above the 44pt minimum.
            className="min-h-14 items-center justify-center rounded-xl bg-blue-600 px-4 active:bg-blue-700 disabled:opacity-50"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-base font-semibold text-white">
                {onEmailStep ? 'Send code' : 'Sign in'}
              </Text>
            )}
          </Pressable>

          {!onEmailStep && (
            <>
              <Pressable
                onPress={() => {
                  setCode('');
                  setError(null);
                  void sendCode();
                }}
                disabled={busy}
                accessibilityRole="button"
                className="min-h-11 items-center justify-center"
              >
                <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                  Resend code
                </Text>
              </Pressable>

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
            </>
          )}

          {error && (
            <Text
              accessibilityRole="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </Text>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
