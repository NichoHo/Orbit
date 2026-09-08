import { useAuth } from '@/hooks/use-auth';
import { useHabitEntries } from '@/hooks/use-habit-entries';
import { useHabits, useUpsertHabit, newHabitId } from '@/hooks/use-habits';
import { HabitRow } from '@/components/habit-row';
import { useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HabitsScreen() {
  const { session } = useAuth();
  const { data: habits = [], isLoading } = useHabits();
  const { data: entries = [] } = useHabitEntries();
  const upsert = useUpsertHabit();
  
  const [title, setTitle] = useState('');

  function add() {
    const trimmed = title.trim();
    if (!trimmed || !session) return;
    upsert.mutate({
      id: newHabitId(),
      user_id: session.user.id,
      title: trimmed,
    });
    setTitle('');
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
        <Text className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">
          Habits
        </Text>
      </View>

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
              No habits yet. Start tracking a new habit below.
            </Text>
          }
          renderItem={({ item }) => (
            <HabitRow
              habit={item}
              entries={entries.filter(e => e.habit_id === item.id)}
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
            placeholder="Add a new habit..."
            accessibilityLabel="New habit title"
            returnKeyType="done"
            blurOnSubmit={false}
            className="min-h-11 flex-1 rounded-xl bg-neutral-100 px-4 text-base text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50"
          />
          <Pressable
            onPress={add}
            disabled={!title.trim()}
            accessibilityRole="button"
            accessibilityLabel="Add habit"
            className="min-h-11 min-w-11 items-center justify-center rounded-xl bg-neutral-900 px-4 disabled:opacity-40 dark:bg-neutral-50"
          >
            <Text className="text-base font-semibold text-white dark:text-neutral-900">
              Add
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
