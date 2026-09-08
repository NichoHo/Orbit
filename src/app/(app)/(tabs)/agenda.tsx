import { View, Text, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTasks } from '@/hooks/use-tasks';
import { TaskRow } from '@/components/task-row';
import { useUpsertTask, toInput } from '@/hooks/use-tasks';
import { useMutationState } from '@tanstack/react-query';
import type { Task } from '@/hooks/use-tasks';

export default function AgendaScreen() {
  const router = useRouter();
  const { data: tasks = [], isLoading } = useTasks();
  const upsert = useUpsertTask();

  const pendingIds = new Set(
    useMutationState({
      filters: { predicate: (m) => m.state.isPaused },
      select: (m) => (m.state.variables as { id?: string } | undefined)?.id,
    }).filter((id): id is string => Boolean(id)),
  );

  function toggle(task: Task) {
    upsert.mutate({
      ...toInput(task),
      completed_at: task.completed_at ? null : new Date().toISOString(),
    });
  }

  // Filter tasks that have a due date, are not completed, and group them by date
  const dueTasks = tasks.filter(t => t.due_date && !t.completed_at).sort((a, b) => {
    return new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime();
  });

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950" edges={['top']}>
      <View className="px-4 pb-2 pt-2">
        <Text className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">
          Agenda
        </Text>
      </View>

      <FlatList
        data={dueTasks}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-4"
        ListEmptyComponent={
          !isLoading ? (
            <Text className="text-center text-neutral-500 mt-10">No upcoming tasks due.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View className="mb-4">
            <Text className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 mb-1 px-4">
              {new Date(item.due_date!).toLocaleDateString(undefined, { 
                weekday: 'long', 
                month: 'short', 
                day: 'numeric' 
              })}
            </Text>
            <View className="bg-neutral-50 dark:bg-neutral-900 rounded-xl overflow-hidden">
              <TaskRow
                task={item}
                pending={pendingIds.has(item.id)}
                onToggle={() => toggle(item)}
                onPress={() => router.push(`/task/${item.id}`)}
              />
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
