import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { type Habit } from '@/hooks/use-habits';
import { type HabitEntry, useUpsertHabitEntry, useSoftDeleteHabitEntry, newHabitEntryId } from '@/hooks/use-habit-entries';
import { useAuth } from '@/hooks/use-auth';
import { toLocalDateStr } from '@/lib/date';

interface HabitRowProps {
  habit: Habit;
  entries: HabitEntry[];
  onPress: () => void;
}

// weekDays is always built Monday-first, so this is a fixed positional
// lookup — no need to re-parse a date string (which would misparse "YYYY-MM-DD"
// as UTC midnight and shift the weekday for anyone west of UTC).
const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function HabitRow({ habit, entries, onPress }: HabitRowProps) {
  const { session } = useAuth();
  const upsertEntry = useUpsertHabitEntry();
  const deleteEntry = useSoftDeleteHabitEntry();

  // Fixed Monday–Sunday week containing today, not a rolling 7-day window —
  // it's the same boundary "3 times this week" progress is measured against.
  const today = new Date();
  const todayStr = toLocalDateStr(today);
  const monday = new Date(today);
  const isoDay = (today.getDay() + 6) % 7; // 0 = Monday ... 6 = Sunday
  monday.setDate(today.getDate() - isoDay);
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toLocalDateStr(d);
  });

  const entriesByDate = new Map(entries.map(e => [e.entry_date, e]));

  let streak = 0;
  if (habit.cadence === 'weekly') {
    // Weekly-cadence habits streak by week, not day — count back from this
    // week as long as each week met target_per_period. The current week
    // doesn't break the streak just for being still in progress.
    for (let w = 0; w < 104; w++) {
      const weekStart = new Date(monday);
      weekStart.setDate(monday.getDate() - w * 7);
      let count = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        if (entriesByDate.has(toLocalDateStr(d))) count++;
      }
      if (count >= habit.target_per_period) {
        streak++;
      } else {
        if (w === 0) continue;
        break;
      }
    }
  } else {
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = toLocalDateStr(d);
      if (entriesByDate.has(dateStr)) {
        streak++;
      } else {
        // If we miss today, we don't break the streak immediately if they had it yesterday
        // Wait, if it's today and they haven't done it yet, streak shouldn't break, it should just not include today.
        if (i === 0) continue;
        break;
      }
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
        <Text
          numberOfLines={1}
          className="flex-1 text-lg font-semibold text-neutral-900 dark:text-neutral-50"
        >
          {habit.title}
        </Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {habit.cadence === 'weekly'
              ? `${streak} ${streak === 1 ? 'week' : 'weeks'}`
              : `${streak} ${streak === 1 ? 'day' : 'days'}`}
          </Text>
          <View
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: streak > 0 ? habit.color : '#d4d4d8' }}
          />
        </View>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Details for "${habit.title}"`}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <Ionicons name="information-circle-outline" size={20} color="#a3a3a3" />
        </Pressable>
      </View>

      <View className="flex-row justify-between">
        {weekDays.map((dateStr, i) => {
          const isCompleted = entriesByDate.has(dateStr);
          const isToday = dateStr === todayStr;
          return (
            <Pressable
              key={dateStr}
              onPress={() => toggleDate(dateStr)}
              className="items-center"
            >
              <View
                className={`h-10 w-10 items-center justify-center rounded-xl ${
                  isCompleted
                    ? 'border-2 border-transparent'
                    : isToday
                      ? 'border-2 border-blue-500'
                      : 'border border-neutral-200 dark:border-neutral-700'
                }`}
                style={{ backgroundColor: isCompleted ? habit.color : 'transparent' }}
              >
                {isCompleted && <Text className="text-white text-lg font-bold">✓</Text>}
              </View>
              <Text className={`mt-1 text-xs ${isToday ? 'font-bold text-neutral-900 dark:text-neutral-100' : 'text-neutral-400'}`}>
                {WEEKDAY_LETTERS[i]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
