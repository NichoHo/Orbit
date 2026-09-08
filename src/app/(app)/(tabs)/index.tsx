import { useMutationState } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TaskRow } from '@/components/task-row';
import { DailySummaryBanner } from '@/components/daily-summary-banner';
import { useAuth } from '@/hooks/use-auth';
import {
  newTaskId,
  toInput,
  useSoftDeleteTask,
  useTasks,
  useUpsertTask,
  type Task,
} from '@/hooks/use-tasks';
import { exportTasksToCSV } from '@/lib/export';

export default function TasksScreen() {
  const { session, signOut } = useAuth();
  const { data: tasks = [], isLoading } = useTasks();
  const upsert = useUpsertTask();
  const remove = useSoftDeleteTask();
  const [title, setTitle] = useState('');

  // Reactive, unlike reading the mutation cache directly — the dot has to
  // disappear when the write lands.
  const pendingIds = new Set(
    useMutationState({
      filters: { predicate: (m) => m.state.isPaused },
      select: (m) => (m.state.variables as { id?: string } | undefined)?.id,
    }).filter((id): id is string => Boolean(id)),
  );

  function add() {
    const trimmed = title.trim();
    if (!trimmed || !session) return;
    upsert.mutate({ id: newTaskId(), user_id: session.user.id, title: trimmed });
    // Cleared immediately. The row is already on screen; making the user wait
    // on a round trip here is the exact thing this architecture exists to avoid.
    setTitle('');
  }

  function toggle(task: Task) {
    upsert.mutate({
      ...toInput(task),
      completed_at: task.completed_at ? null : new Date().toISOString(),
    });
  }

  function confirmSignOut() {
    // Sign-out clears the cache, which discards queued writes with it (§5.8).
    if (pendingIds.size > 0) {
      Alert.alert(
        'Unsynced changes',
        `${pendingIds.size} change${pendingIds.size === 1 ? '' : 's'} ` +
          'have not reached the server yet. Signing out discards them.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard and sign out', style: 'destructive', onPress: () => void signOut() },
        ],
      );
      return;
    }
    void signOut();
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
        <Text className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">
          Tasks
        </Text>
        <View className="flex-row items-center gap-4">
          <Pressable
            onPress={() => exportTasksToCSV(tasks)}
            accessibilityRole="button"
            accessibilityLabel="Export tasks"
            className="min-h-11 min-w-11 items-center justify-center"
          >
            <Text className="text-sm text-green-600 dark:text-green-400 font-medium">Export</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/search')}
            accessibilityRole="button"
            accessibilityLabel="Search tasks"
            className="min-h-11 min-w-11 items-center justify-center"
          >
            <Text className="text-sm text-blue-600 dark:text-blue-400 font-medium">Search</Text>
          </Pressable>
          <Pressable
            onPress={confirmSignOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            className="min-h-11 min-w-11 items-end justify-center"
          >
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">Sign out</Text>
          </Pressable>
        </View>
      </View>

      <DailySummaryBanner />

      {isLoading && tasks.length === 0 ? (
        <ActivityIndicator className="mt-8" />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(t) => t.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text className="px-4 pt-8 text-center text-neutral-400">
              Nothing yet. Add your first task below.
            </Text>
          }
          renderItem={({ item }) => (
            <TaskRow
              task={item}
              pending={pendingIds.has(item.id)}
              onToggle={() => toggle(item)}
              onPress={() => router.push(`/task/${item.id}`)}
            />
          )}
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View className="flex-row items-center gap-2 border-t border-neutral-100 px-4 py-3 dark:border-neutral-900">
          <TextInput
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={add}
            placeholder="Add a task"
            accessibilityLabel="New task title"
            returnKeyType="done"
            blurOnSubmit={false}
            className="min-h-11 flex-1 rounded-xl bg-neutral-100 px-4 text-base text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50"
          />
          <Pressable
            onPress={add}
            disabled={!title.trim()}
            accessibilityRole="button"
            accessibilityLabel="Add task"
            className="min-h-11 min-w-11 items-center justify-center rounded-xl bg-neutral-900 px-4 disabled:opacity-40 dark:bg-neutral-50"
          >
            <Text className="text-base font-semibold text-white dark:text-neutral-900">
              Add
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {remove.isError && (
        <Text className="px-4 pb-2 text-xs text-red-600">Could not delete that task.</Text>
      )}
    </SafeAreaView>
  );
}
