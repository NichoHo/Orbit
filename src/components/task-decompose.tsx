import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { decomposeTask } from '@/lib/ai';
import { useUpsertTask, newTaskId, type Task } from '@/hooks/use-tasks';

export function TaskDecompose({ task }: { task: Task }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upsert = useUpsertTask();

  async function handleDecompose() {
    setLoading(true);
    setError(null);
    try {
      const result = await decomposeTask(task.id, task.title);
      // Result is an array of subtasks
      for (const sub of result.subtasks) {
        upsert.mutate({
          id: newTaskId(),
          user_id: task.user_id,
          parent_id: task.id,
          title: sub.title || 'Subtask',
          estimated_min: sub.estimated_min || null,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to decompose task');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="gap-2">
      <Text className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        AI Tools
      </Text>
      <Pressable
        onPress={handleDecompose}
        disabled={loading}
        className="min-h-11 flex-row items-center justify-center rounded-xl bg-[#6366f1] px-4 disabled:opacity-50"
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text className="text-base font-semibold text-white">
            Decompose with AI
          </Text>
        )}
      </Pressable>
      {error && <Text className="text-xs text-red-500 mt-1">{error}</Text>}
    </View>
  );
}
