import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  toInput,
  useSoftDeleteTask,
  useTasks,
  useUpsertTask,
  type TaskPriority,
} from '@/hooks/use-tasks';
import { Constants } from '@/types/supabase';
import { TaskDecompose } from '@/components/task-decompose';

/** Generated from the Postgres enum, so a new priority in SQL appears here. */
const PRIORITIES = Constants.public.Enums.task_priority;

const startOfDayIn = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
};

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

  const task = tasks.find((t) => t.id === id);
  const [title, setTitle] = useState(task?.title ?? '');
  const [tagText, setTagText] = useState(task?.tags.join(', ') ?? '');
  const [notes, setNotes] = useState(task?.description ?? '');

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

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      <View className="flex-row items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-900">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          className="min-h-11 justify-center"
        >
          <Text className="text-base text-blue-600">Done</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            remove.mutate({ id: task.id });
            router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel="Delete task"
          className="min-h-11 justify-center"
        >
          <Text className="text-base text-red-600">Delete</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerClassName="gap-6 py-5">
        <TextInput
          value={title}
          onChangeText={setTitle}
          onBlur={() => {
            const trimmed = title.trim();
            // Empty title would violate the DB check constraint; revert instead
            // of queuing a write that can only fail.
            if (!trimmed) return setTitle(task.title);
            if (trimmed !== task.title) patch({ title: trimmed });
          }}
          accessibilityLabel="Task title"
          multiline
          className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50"
        />

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
          <Text className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Due
          </Text>
          <View className="flex-row gap-2">
            {DUE_OPTIONS.map((option) => (
              <Pressable
                key={option.label}
                onPress={() => patch({ due_date: option.value() })}
                accessibilityRole="button"
                className="min-h-11 flex-1 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-900"
              >
                <Text className="text-sm text-neutral-600 dark:text-neutral-400">
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {task.due_date && (
            <Text className="text-sm text-neutral-500">
              {new Intl.DateTimeFormat(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              }).format(new Date(task.due_date))}
            </Text>
          )}
        </View>

        <View className="gap-2">
          <Text className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Tags
          </Text>
          <TextInput
            value={tagText}
            onChangeText={setTagText}
            onBlur={() =>
              patch({
                tags: tagText
                  .split(',')
                  .map((t) => t.trim().replace(/^#/, ''))
                  .filter(Boolean),
              })
            }
            placeholder="work, errands"
            accessibilityLabel="Tags, comma separated"
            autoCapitalize="none"
            className="min-h-11 rounded-xl bg-neutral-100 px-4 text-base text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50"
          />
        </View>

        <View className="gap-2">
          <Text className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Notes
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            onBlur={() => patch({ description: notes.trim() || null })}
            placeholder="Anything else"
            accessibilityLabel="Notes"
            multiline
            className="min-h-24 rounded-xl bg-neutral-100 px-4 py-3 text-base text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50"
          />
        </View>

        <TaskDecompose task={task} />
      </ScrollView>
    </SafeAreaView>
  );
}
