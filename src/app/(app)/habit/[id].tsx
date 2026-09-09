import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  toHabitInput,
  useHabits,
  useSoftDeleteHabit,
  useUpsertHabit,
  type HabitCadence,
} from '@/hooks/use-habits';
import { Constants } from '@/types/supabase';

/** Generated from the Postgres enum, so a new cadence in SQL appears here. */
const CADENCES = Constants.public.Enums.habit_cadence;

// ponytail: a fixed palette instead of a full color picker. Matches the set
// Reminders-style apps offer for list colors; add a custom swatch if asked.
const COLORS = ['#dc2626', '#f97316', '#eab308', '#22c55e', '#2563eb', '#9333ea', '#ec4899', '#6366f1'];

export default function HabitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: habits = [] } = useHabits();
  const upsert = useUpsertHabit();
  const remove = useSoftDeleteHabit();

  const habit = habits.find((h) => h.id === id);
  const [title, setTitle] = useState(habit?.title ?? '');

  if (!habit) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-neutral-950">
        <Text className="text-neutral-500">This habit no longer exists.</Text>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          className="min-h-11 justify-center px-4"
        >
          <Text className="text-blue-600">Close</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // Same immediate-write pattern as the task detail screen — every control
  // patches straight through, so there's no Save button and nothing to lose.
  const patch = (changes: Partial<ReturnType<typeof toHabitInput>>) =>
    upsert.mutate({ ...toHabitInput(habit), ...changes });

  // onBlur alone isn't reliable here: tapping Done while the field still has
  // focus can navigate away before the blur event finishes committing the
  // edit, which is why renaming looked like it silently did nothing. Done
  // now calls this directly so the edit is flushed either way.
  const commitTitle = () => {
    const trimmed = title.trim();
    if (!trimmed) return setTitle(habit.title);
    if (trimmed !== habit.title) patch({ title: trimmed });
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      {/* Done alone in the header, on the right — the corner people tap out
          of habit to dismiss a sheet. Delete used to sit right next to it,
          which meant that same reflex tap could delete instead of close. */}
      <View className="flex-row items-center justify-end border-b border-neutral-100 px-4 py-3 dark:border-neutral-900">
        <Pressable
          onPress={() => {
            commitTitle();
            router.back();
          }}
          accessibilityRole="button"
          className="min-h-11 justify-center"
        >
          <Text className="text-base font-semibold text-blue-600">Done</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerClassName="gap-6 py-5">
        <View className="flex-row items-center gap-2">
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={commitTitle}
            accessibilityLabel="Habit title"
            // fontSize in style, not the text-2xl className — avoids the iOS
            // lineHeight clip on focus (see sign-in.tsx).
            style={{ fontSize: 24 }}
            className="flex-1 font-semibold text-neutral-900 dark:text-neutral-50"
          />
          <Ionicons name="pencil" size={16} color="#a3a3a3" />
        </View>

        <View className="gap-2">
          <Text className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Frequency
          </Text>
          <View className="flex-row gap-2">
            {CADENCES.map((c: HabitCadence) => {
              const active = habit.cadence === c;
              return (
                <Pressable
                  key={c}
                  onPress={() =>
                    patch({
                      cadence: c,
                      // Daily has no meaningful target — pin it to 1 so an old
                      // weekly target doesn't linger unseen.
                      target_per_period: c === 'daily' ? 1 : habit.target_per_period,
                    })
                  }
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  className={`min-h-11 flex-1 items-center justify-center rounded-xl ${
                    active ? 'bg-neutral-900 dark:bg-neutral-50' : 'bg-neutral-100 dark:bg-neutral-900'
                  }`}
                >
                  <Text
                    className={`text-sm capitalize ${
                      active
                        ? 'font-semibold text-white dark:text-neutral-900'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {c}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {habit.cadence === 'weekly' && (
            <View className="flex-row items-center justify-between rounded-xl bg-neutral-100 px-4 py-2 dark:bg-neutral-900">
              <Text className="text-sm text-neutral-600 dark:text-neutral-400">
                Times per week
              </Text>
              <View className="flex-row items-center gap-4">
                <Pressable
                  onPress={() => patch({ target_per_period: Math.max(1, habit.target_per_period - 1) })}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease target"
                  className="h-8 w-8 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-800"
                >
                  <Ionicons name="remove" size={18} color="#525252" />
                </Pressable>
                <Text className="w-4 text-center text-base font-semibold text-neutral-900 dark:text-neutral-50">
                  {habit.target_per_period}
                </Text>
                <Pressable
                  onPress={() => patch({ target_per_period: Math.min(7, habit.target_per_period + 1) })}
                  accessibilityRole="button"
                  accessibilityLabel="Increase target"
                  className="h-8 w-8 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-800"
                >
                  <Ionicons name="add" size={18} color="#525252" />
                </Pressable>
              </View>
            </View>
          )}
        </View>

        <View className="gap-2">
          <Text className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Color
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {COLORS.map((color) => {
              const active = habit.color === color;
              return (
                <Pressable
                  key={color}
                  onPress={() => patch({ color })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Color ${color}`}
                  className="h-11 w-11 items-center justify-center rounded-full"
                  style={{ backgroundColor: color }}
                >
                  {active && <Ionicons name="checkmark" size={20} color="#fff" />}
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={() =>
            Alert.alert('Delete this habit?', "This can't be undone.", [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  remove.mutate({ id: habit.id });
                  router.back();
                },
              },
            ])
          }
          accessibilityRole="button"
          accessibilityLabel="Delete habit"
          className="min-h-11 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/40"
        >
          <Text className="text-base font-semibold text-red-600">Delete Habit</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
