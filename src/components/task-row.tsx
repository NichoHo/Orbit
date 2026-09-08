import { Pressable, Text, View } from 'react-native';

import type { Task, TaskPriority } from '@/hooks/use-tasks';

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low: 'bg-neutral-400',
  medium: 'bg-blue-500',
  high: 'bg-amber-500',
  urgent: 'bg-red-600',
};

function dueLabel(due: string | null): string | null {
  if (!due) return null;
  const days = Math.round((Date.parse(due) - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(due),
  );
}

export function TaskRow({
  task,
  pending,
  onToggle,
  onPress,
}: {
  task: Task;
  /** Only ever true while offline — see blueprint §5.8. */
  pending: boolean;
  onToggle: () => void;
  onPress: () => void;
}) {
  const done = task.completed_at !== null;
  const due = dueLabel(task.due_date);

  return (
    <View className="flex-row items-center gap-3 border-b border-neutral-100 px-4 dark:border-neutral-900">
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`Mark "${task.title}" ${done ? 'incomplete' : 'complete'}`}
        // Deliberately larger than the visible circle: 44pt minimum target.
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <View
          className={`h-6 w-6 rounded-full border-2 ${
            done
              ? 'border-neutral-400 bg-neutral-400'
              : 'border-neutral-300 dark:border-neutral-600'
          }`}
        />
      </Pressable>

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={task.title}
        className="min-h-14 flex-1 justify-center py-2"
      >
        <View className="flex-row items-center gap-2">
          <View className={`h-2 w-2 rounded-full ${PRIORITY_DOT[task.priority]}`} />
          <Text
            numberOfLines={1}
            className={`flex-1 text-base ${
              done
                ? 'text-neutral-400 line-through dark:text-neutral-600'
                : 'text-neutral-900 dark:text-neutral-50'
            }`}
          >
            {task.title}
          </Text>
          {pending && (
            <Text
              accessibilityLabel="Waiting to sync"
              className="text-xs text-neutral-400"
            >
              ↻
            </Text>
          )}
        </View>

        {(due || task.tags.length > 0) && (
          <View className="ml-4 flex-row items-center gap-2 pt-0.5">
            {due && (
              <Text
                className={`text-xs ${
                  due.includes('overdue') ? 'text-red-600' : 'text-neutral-500'
                }`}
              >
                {due}
              </Text>
            )}
            {task.tags.length > 0 && (
              <Text numberOfLines={1} className="flex-1 text-xs text-neutral-400">
                {task.tags.map((t) => `#${t}`).join(' ')}
              </Text>
            )}
          </View>
        )}
      </Pressable>
    </View>
  );
}
