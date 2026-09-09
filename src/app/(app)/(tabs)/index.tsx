import { Ionicons } from '@expo/vector-icons';
import { useMutationState } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useRef } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddTaskRow, type AddTaskRowHandle } from '@/components/add-task-row';
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

const ADD_ROW = { id: '__add-row__' } as const;
type Row = Task | typeof ADD_ROW;

export default function TasksScreen() {
  const { session, signOut } = useAuth();
  const { data: tasks = [], isLoading } = useTasks();
  const upsert = useUpsertTask();
  const remove = useSoftDeleteTask();

  const listRef = useRef<Animated.FlatList<Row>>(null);
  const addRowRef = useRef<AddTaskRowHandle>(null);

  // Reactive, unlike reading the mutation cache directly — the dot has to
  // disappear when the write lands.
  const pendingIds = new Set(
    useMutationState({
      filters: { predicate: (m) => m.state.isPaused },
      select: (m) => (m.state.variables as { id?: string } | undefined)?.id,
    }).filter((id): id is string => Boolean(id)),
  );

  // Open tasks first, then the add row, then completed — the add row always
  // sits at the boundary instead of getting buried under finished work.
  const { rows, addRowIndex } = useMemo(() => {
    const open = tasks.filter((t) => !t.completed_at);
    const done = tasks.filter((t) => t.completed_at);
    return { rows: [...open, ADD_ROW, ...done] as Row[], addRowIndex: open.length };
  }, [tasks]);

  function addTask(title: string) {
    if (!session) return;
    upsert.mutate({ id: newTaskId(), user_id: session.user.id, title });
  }

  function toggle(task: Task) {
    upsert.mutate({
      ...toInput(task),
      completed_at: task.completed_at ? null : new Date().toISOString(),
    });
  }

  function focusAddRow() {
    listRef.current?.scrollToIndex({ index: addRowIndex, animated: true, viewPosition: 0.5 });
    // ponytail: fixed delay instead of listening for scroll-end — good enough
    // for a short in-app list; swap for an onMomentumScrollEnd callback if
    // longer lists ever make the scroll outlast this.
    setTimeout(() => addRowRef.current?.focus(), 300);
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
            <Ionicons name="share-outline" size={22} color="#16a34a" />
          </Pressable>
          <Pressable
            onPress={() => router.push('/search')}
            accessibilityRole="button"
            accessibilityLabel="Search tasks"
            className="min-h-11 min-w-11 items-center justify-center"
          >
            <Ionicons name="search" size={22} color="#2563eb" />
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
        <Animated.FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(row) => row.id}
          keyboardShouldPersistTaps="handled"
          itemLayoutAnimation={LinearTransition.duration(250)}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
            setTimeout(() => focusAddRow(), 100);
          }}
          renderItem={({ item }) =>
            'user_id' in item ? (
              <TaskRow
                task={item}
                pending={pendingIds.has(item.id)}
                onToggle={() => toggle(item)}
                onPress={() => router.push(`/task/${item.id}`)}
              />
            ) : (
              <AddTaskRow ref={addRowRef} onSubmit={addTask} />
            )
          }
        />
      )}

      <Pressable
        onPress={focusAddRow}
        accessibilityRole="button"
        accessibilityLabel="Add a task"
        className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-blue-600 shadow-lg shadow-black/30"
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {remove.isError && (
        <Text className="px-4 pb-2 text-xs text-red-600">Could not delete that task.</Text>
      )}
    </SafeAreaView>
  );
}
