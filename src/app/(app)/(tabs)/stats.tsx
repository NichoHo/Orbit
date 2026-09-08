import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTasks } from '@/hooks/use-tasks';
import { useHabits } from '@/hooks/use-habits';

export default function StatsScreen() {
  const { data: tasks } = useTasks();
  const { data: habits } = useHabits();

  // Basic stats
  const completedTasks = tasks?.filter((t) => t.completed_at).length || 0;
  const pendingTasks = tasks?.filter((t) => !t.completed_at).length || 0;
  const totalTasks = (tasks?.length || 0);
  const completionRate = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <SafeAreaView className="flex-1 bg-neutral-50 dark:bg-neutral-900" edges={['top']}>
      <ScrollView className="flex-1 px-4" contentContainerClassName="pb-6 pt-2">
        <Text className="text-3xl font-extrabold text-neutral-900 dark:text-neutral-50 mb-6">Insights</Text>

        <View className="flex-row flex-wrap gap-4 mb-8">
          <View className="flex-1 min-w-[140px] bg-white dark:bg-neutral-800 p-4 rounded-3xl shadow-sm">
            <Text className="text-neutral-500 dark:text-neutral-400 text-sm font-medium mb-1">Completion Rate</Text>
            <Text className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{completionRate}%</Text>
          </View>
          <View className="flex-1 min-w-[140px] bg-white dark:bg-neutral-800 p-4 rounded-3xl shadow-sm">
            <Text className="text-neutral-500 dark:text-neutral-400 text-sm font-medium mb-1">Completed Tasks</Text>
            <Text className="text-3xl font-bold text-green-600 dark:text-green-400">{completedTasks}</Text>
          </View>
        </View>

        <Text className="text-xl font-bold text-neutral-800 dark:text-neutral-100 mb-4">Task Overview</Text>
        
        {/* Simple Bar Chart replacement */}
        <View className="bg-white dark:bg-neutral-800 p-5 rounded-3xl shadow-sm mb-8">
          <View className="flex-row items-end h-40 gap-2">
            <View className="flex-1 items-center justify-end h-full">
              <View className="w-full bg-indigo-500 rounded-t-xl" style={{ height: `${totalTasks ? (pendingTasks / totalTasks) * 100 : 0}%` }} />
              <Text className="text-xs text-neutral-500 mt-2 font-medium">Pending ({pendingTasks})</Text>
            </View>
            <View className="flex-1 items-center justify-end h-full">
              <View className="w-full bg-green-500 rounded-t-xl" style={{ height: `${totalTasks ? (completedTasks / totalTasks) * 100 : 0}%` }} />
              <Text className="text-xs text-neutral-500 mt-2 font-medium">Done ({completedTasks})</Text>
            </View>
          </View>
        </View>

        <Text className="text-xl font-bold text-neutral-800 dark:text-neutral-100 mb-4">Habits Overview</Text>
        {habits?.length === 0 ? (
          <Text className="text-neutral-500 text-center py-4">No habits to track yet.</Text>
        ) : (
          <View className="gap-3">
            {habits?.map((habit) => (
              <View key={habit.id} className="bg-white dark:bg-neutral-800 p-4 rounded-2xl flex-row justify-between items-center shadow-sm">
                <Text className="font-medium text-neutral-900 dark:text-neutral-100">{habit.title}</Text>
                <View className="bg-indigo-100 dark:bg-indigo-900/30 px-3 py-1 rounded-full">
                  <Text className="text-indigo-600 dark:text-indigo-400 text-xs font-medium">{habit.cadence}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
