import { Ionicons } from '@expo/vector-icons';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  toInput,
  useSoftDeleteTask,
  useTasks,
  useUpsertTask,
  type TaskPriority,
} from '@/hooks/use-tasks';
import { Constants } from '@/types/supabase';

/** Generated from the Postgres enum, so a new priority in SQL appears here. */
const PRIORITIES = Constants.public.Enums.task_priority;

const startOfDayIn = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
};

// Postgres round-trips a timestamptz as "2026-09-10 02:00:00+00", not JS's
// "...T...000Z" — same instant, different string. Comparing raw strings makes
// every preset look unmatched (falls through to "Custom") the moment the
// server row replaces the optimistic one. Compare parsed instants instead.
const sameInstant = (a: string | null, b: string | null): boolean =>
  a === null || b === null ? a === b : new Date(a).getTime() === new Date(b).getTime();

// ponytail: four presets instead of a calendar picker. Covers the overwhelming
// majority of task due dates without a native-module dependency. Add
// @react-native-community/datetimepicker if arbitrary dates are actually asked for.
const DUE_OPTIONS: { label: string; value: () => string | null }[] = [
  { label: 'None', value: () => null },
  { label: 'Today', value: () => startOfDayIn(0) },
  { label: 'Tomorrow', value: () => startOfDayIn(1) },
  { label: 'Next week', value: () => startOfDayIn(7) },
];

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: tasks = [] } = useTasks();
  const upsert = useUpsertTask();
  const remove = useSoftDeleteTask();

  const dark = useColorScheme() === 'dark';
  const task = tasks.find((t) => t.id === id);
  const [title, setTitle] = useState(task?.title ?? '');
  const [tagText, setTagText] = useState(task?.tags.join(', ') ?? '');
  const [notes, setNotes] = useState(task?.description ?? '');
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  if (!task) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-neutral-950">
        <Text className="text-neutral-500">This task no longer exists.</Text>
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

  // Every control writes through immediately — the cache updates on this frame
  // and the network catches up whenever it can. There is no Save button because
  // there is nothing to wait for.
  const patch = (changes: Partial<ReturnType<typeof toInput>>) =>
    upsert.mutate({ ...toInput(task), ...changes });

  // onBlur alone isn't reliable here: tapping Done while a field still has
  // focus can navigate away before the blur event finishes committing the
  // edit, which is why renaming looked like it silently did nothing. Done
  // now calls these directly so the edit is flushed either way.
  const commitTitle = () => {
    const trimmed = title.trim();
    // Empty title would violate the DB check constraint; revert instead
    // of queuing a write that can only fail.
    if (!trimmed) return setTitle(task.title);
    if (trimmed !== task.title) patch({ title: trimmed });
  };
  const commitTags = () =>
    patch({
      tags: tagText
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean),
    });
  const commitNotes = () => patch({ description: notes.trim() || null });

  const isCustomDue = task.due_date !== null && !DUE_OPTIONS.some((o) => sameInstant(o.value(), task.due_date));

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      {/* Done alone in the header, on the right — the corner people tap out
          of habit to dismiss a sheet. Delete used to sit right next to it,
          which meant that same reflex tap could delete instead of close. */}
      <View className="flex-row items-center justify-end border-b border-neutral-100 px-4 py-3 dark:border-neutral-900">
        <Pressable
          onPress={() => {
            commitTitle();
            commitTags();
            commitNotes();
            router.back();
          }}
          accessibilityRole="button"
          className="min-h-11 justify-center"
        >
          <Text className="text-base font-semibold text-blue-600">Done</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerClassName="gap-6 py-5">
        <View className="flex-row items-start gap-2">
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={commitTitle}
            accessibilityLabel="Task title"
            multiline
            // fontSize in style, not the text-2xl className — avoids the iOS
            // lineHeight clip on focus (see sign-in.tsx).
            style={{ fontSize: 24 }}
            className="flex-1 font-semibold text-neutral-900 dark:text-neutral-50"
          />
          <Ionicons name="pencil" size={16} color="#a3a3a3" style={{ marginTop: 8 }} />
        </View>

        <View className="gap-2">
          <Text className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Priority
          </Text>
          <View className="flex-row gap-2">
            {PRIORITIES.map((p: TaskPriority) => {
              const active = task.priority === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => patch({ priority: p })}
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
                    {p}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gap-2">
          <View className="flex-row items-baseline justify-between">
            <Text className="text-xs font-medium uppercase tracking-wide text-neutral-400">
              Due
            </Text>
            {task.due_date && (
              <Text className="text-sm font-medium text-blue-600 dark:text-blue-400">
                {new Intl.DateTimeFormat(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                }).format(new Date(task.due_date))}
              </Text>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            {DUE_OPTIONS.map((option) => {
              const active = sameInstant(task.due_date, option.value());
              return (
                <Pressable
                  key={option.label}
                  onPress={() => {
                    setShowCustomPicker(false);
                    patch({ due_date: option.value() });
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  className={`min-h-11 items-center justify-center rounded-full px-4 ${
                    active ? 'bg-neutral-900 dark:bg-neutral-50' : 'bg-neutral-100 dark:bg-neutral-900'
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      active
                        ? 'font-semibold text-white dark:text-neutral-900'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setShowCustomPicker((v) => !v)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isCustomDue }}
              className={`min-h-11 flex-row items-center justify-center gap-1.5 rounded-full px-4 ${
                isCustomDue ? 'bg-neutral-900 dark:bg-neutral-50' : 'bg-neutral-100 dark:bg-neutral-900'
              }`}
            >
              <Ionicons
                name="calendar-outline"
                size={15}
                color={isCustomDue ? (dark ? '#171717' : '#fff') : '#a3a3a3'}
              />
              <Text
                className={`text-sm ${
                  isCustomDue
                    ? 'font-semibold text-white dark:text-neutral-900'
                    : 'text-neutral-600 dark:text-neutral-400'
                }`}
              >
                Custom
              </Text>
            </Pressable>
          </ScrollView>
          {showCustomPicker && (
            <DateTimePicker
              value={task.due_date ? new Date(task.due_date) : new Date()}
              mode="date"
              onValueChange={(_event, date) => {
                patch({ due_date: date.toISOString() });
                // Android's picker is a confirm/cancel dialog, so a value change
                // means "done" — close it. iOS's is an inline wheel that fires
                // this on every scroll tick, so closing here would yank it away
                // mid-scroll; the Custom button toggle is how it closes there.
                if (Platform.OS === 'android') setShowCustomPicker(false);
              }}
              onDismiss={() => setShowCustomPicker(false)}
            />
          )}
        </View>

        <View className="gap-2">
          <Text className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Tags
          </Text>
          <TextInput
            value={tagText}
            onChangeText={setTagText}
            onBlur={commitTags}
            placeholder="work, errands"
            accessibilityLabel="Tags, comma separated"
            autoCapitalize="none"
            // fontSize in style, not the text-base className — avoids the iOS
            // lineHeight clip on focus (see sign-in.tsx).
            style={{ fontSize: 16 }}
            className="min-h-11 rounded-xl bg-neutral-100 px-4 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50"
          />
        </View>

        <View className="gap-2">
          <Text className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Notes
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            onBlur={commitNotes}
            placeholder="Anything else"
            accessibilityLabel="Notes"
            multiline
            // fontSize in style, not the text-base className — avoids the iOS
            // lineHeight clip on focus (see sign-in.tsx).
            style={{ fontSize: 16 }}
            className="min-h-24 rounded-xl bg-neutral-100 px-4 py-3 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50"
          />
        </View>

        <Pressable
          onPress={() =>
            Alert.alert('Delete this task?', "This can't be undone.", [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  remove.mutate({ id: task.id });
                  router.back();
                },
              },
            ])
          }
          accessibilityRole="button"
          accessibilityLabel="Delete task"
          className="min-h-11 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/40"
        >
          <Text className="text-base font-semibold text-red-600">Delete Task</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
