import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HabitRow } from '@/components/habit-row';
import { useAuth } from '@/hooks/use-auth';
import { useHabitEntries } from '@/hooks/use-habit-entries';
import { useHabits, useUpsertHabit, newHabitId } from '@/hooks/use-habits';

export default function HabitsScreen() {
  const { session } = useAuth();
  const { data: habits = [], isLoading } = useHabits();
  const { data: entries = [] } = useHabitEntries();
  const upsert = useUpsertHabit();

  const [showAddInput, setShowAddInput] = useState(false);
  const [title, setTitle] = useState('');

  // Habits are added rarely — a handful, set up once — unlike tasks, so this
  // is a one-shot reveal-and-close input rather than the tasks list's
  // always-there, chain-adding row.
  function add() {
    const trimmed = title.trim();
    if (trimmed && session) {
      upsert.mutate({ id: newHabitId(), user_id: session.user.id, title: trimmed });
    }
    setTitle('');
    setShowAddInput(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
        <Text className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">
          Habits
        </Text>
        <Pressable
          onPress={() => setShowAddInput((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={showAddInput ? 'Cancel adding a habit' : 'Add a habit'}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <Ionicons name={showAddInput ? 'close' : 'add'} size={26} color="#2563eb" />
        </Pressable>
      </View>

      {showAddInput && (
        <View className="flex-row items-center gap-2 px-4 pb-3">
          <TextInput
            autoFocus
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={add}
            onBlur={() => !title.trim() && setShowAddInput(false)}
            placeholder="Habit name"
            accessibilityLabel="New habit title"
            returnKeyType="done"
            // fontSize in style, not the text-base className — avoids the iOS
            // lineHeight clip on focus (see sign-in.tsx).
            style={{ fontSize: 16 }}
            className="min-h-11 flex-1 rounded-xl bg-neutral-100 px-4 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50"
          />
          <Pressable
            onPress={add}
            disabled={!title.trim()}
            accessibilityRole="button"
            accessibilityLabel="Save habit"
            className="min-h-11 min-w-11 items-center justify-center rounded-xl bg-blue-600 disabled:opacity-40"
          >
            <Ionicons name="checkmark" size={20} color="#fff" />
          </Pressable>
        </View>
      )}

      {isLoading && habits.length === 0 ? (
        <ActivityIndicator className="mt-8" />
      ) : (
        <FlatList
          data={habits}
          keyExtractor={(h) => h.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16 }}
          ListEmptyComponent={
            <Text className="pt-8 text-center text-neutral-400">
              No habits yet. Tap + to start tracking one.
            </Text>
          }
          renderItem={({ item }) => (
            <HabitRow
              habit={item}
              entries={entries.filter((e) => e.habit_id === item.id)}
              onPress={() => router.push(`/habit/${item.id}`)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
