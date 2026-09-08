import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { type Habit } from '@/hooks/use-habits';
import { type HabitEntry, useUpsertHabitEntry, useSoftDeleteHabitEntry, newHabitEntryId } from '@/hooks/use-habit-entries';
import { useAuth } from '@/hooks/use-auth';

interface HabitRowProps {
  habit: Habit;
  entries: HabitEntry[];
}

export function HabitRow({ habit, entries }: HabitRowProps) {
  const { session } = useAuth();
  const upsertEntry = useUpsertHabitEntry();
  const deleteEntry = useSoftDeleteHabitEntry();

  // Create an array of the last 7 days including today
  const today = new Date();
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d.toISOString().split('T')[0]!;
  });

  const entriesByDate = new Map(entries.map(e => [e.entry_date, e]));

  // Streak logic (matches the view's logic roughly for display):
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]!;
    if (entriesByDate.has(dateStr)) {
      streak++;
    } else {
      // If we miss today, we don't break the streak immediately if they had it yesterday
      // Wait, if it's today and they haven't done it yet, streak shouldn't break, it should just not include today.
      if (i === 0) continue;
      break;
    }
  }

  function toggleDate(dateStr: string) {
    if (!session) return;
    const existing = entriesByDate.get(dateStr);
    if (existing) {
      deleteEntry.mutate({ id: existing.id });
    } else {
      upsertEntry.mutate({
        id: newHabitEntryId(),
        habit_id: habit.id,
        user_id: session.user.id,
        entry_date: dateStr,
      });
    }
  }

  return (
    <View className="mb-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          {habit.title}
        </Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {streak} {streak === 1 ? 'day' : 'days'}
          </Text>
          <View className="h-2 w-2 rounded-full" style={{ backgroundColor: streak > 0 ? habit.color : '#d4d4d8' }} />
        </View>
      </View>

      <View className="flex-row justify-between">
        {last7Days.map((dateStr, i) => {
          const isCompleted = entriesByDate.has(dateStr);
          const isToday = i === 6;
          return (
            <Pressable
              key={dateStr}
              onPress={() => toggleDate(dateStr)}
              className="items-center"
            >
              <View
                className={`h-10 w-10 items-center justify-center rounded-xl border ${
                  isCompleted ? 'border-transparent' : 'border-neutral-200 dark:border-neutral-700'
                }`}
                style={{ backgroundColor: isCompleted ? habit.color : 'transparent' }}
              >
                {isCompleted && <Text className="text-white text-lg font-bold">✓</Text>}
              </View>
              <Text className={`mt-1 text-xs ${isToday ? 'font-bold text-neutral-900 dark:text-neutral-100' : 'text-neutral-400'}`}>
                {new Date(dateStr).toLocaleDateString('en-US', { weekday: 'narrow' })}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
