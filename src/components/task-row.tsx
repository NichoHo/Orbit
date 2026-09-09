import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Pressable, Text, useColorScheme, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { Task, TaskPriority } from '@/hooks/use-tasks';

const ACCENT = '#2563eb';
const IDLE_BORDER = { light: '#d4d4d4', dark: '#525252' };

// Only the elevated priorities get a cue — medium is the default every task
// starts at, so marking it too would just be noise on most rows.
const PRIORITY_DOT: Partial<Record<TaskPriority, string>> = {
  high: '#f97316',
  urgent: '#dc2626',
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

function Checkbox({
  done,
  onToggle,
  accessibilityLabel,
}: {
  done: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
}) {
  const idleBorder = IDLE_BORDER[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const progress = useSharedValue(done ? 1 : 0);
  const scale = useSharedValue(1);
  const mounted = useRef(false);

  useEffect(() => {
    progress.value = withTiming(done ? 1 : 0, { duration: 200 });
    // Skip the bounce on first mount — only a real toggle earns the flourish.
    if (mounted.current) {
      scale.value = withSequence(withTiming(1.2, { duration: 120 }), withSpring(1, { damping: 9 }));
    }
    mounted.current = true;
  }, [done, progress, scale]);

  const circleStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], [idleBorder, ACCENT]),
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['rgba(37,99,235,0)', ACCENT],
    ),
    transform: [{ scale: scale.value }],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.5 + progress.value * 0.5 }],
  }));

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={accessibilityLabel}
      // Deliberately larger than the visible circle: 44pt minimum target.
      className="min-h-11 min-w-11 items-center justify-center"
    >
      <Animated.View
        style={circleStyle}
        className="h-6 w-6 items-center justify-center rounded-full border-2"
      >
        <Animated.View style={checkStyle}>
          <Ionicons name="checkmark" size={14} color="#fff" />
        </Animated.View>
      </Animated.View>
    </Pressable>
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
      <Checkbox
        done={done}
        onToggle={onToggle}
        accessibilityLabel={`Mark "${task.title}" ${done ? 'incomplete' : 'complete'}`}
      />

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={task.title}
        className="min-h-14 flex-1 justify-center py-2"
      >
        <View className="flex-row items-center gap-2">
          {PRIORITY_DOT[task.priority] && (
            <View
              accessible
              accessibilityLabel={`${task.priority} priority`}
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: PRIORITY_DOT[task.priority] }}
            />
          )}
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
          <View className="flex-row items-center gap-2 pt-0.5">
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

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Details for "${task.title}"`}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <Ionicons name="information-circle-outline" size={22} color="#a3a3a3" />
      </Pressable>
    </View>
  );
}
