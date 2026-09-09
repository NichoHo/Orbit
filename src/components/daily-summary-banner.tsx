import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { fetchDailySummary } from '@/lib/ai';
import { toLocalDateStr } from '@/lib/date';
import { queryClient } from '@/lib/query';

export function DailySummaryBanner() {
  const today = toLocalDateStr(new Date());
  const queryKey = ['daily-summary', today] as const;

  // enabled: false: this query only ever serves what's already in the
  // (disk-persisted) cache. The mutation below is what actually fetches, on
  // "Generate" or "Again": that's what keeps the summary showing after a
  // reload, and what makes the key naturally reset at midnight (a new
  // "today" is a cache miss, so the banner falls back to its empty state).
  const { data } = useQuery({
    queryKey,
    queryFn: () => fetchDailySummary(today),
    enabled: false,
    staleTime: Infinity,
  });

  const generate = useMutation({
    mutationFn: (force: boolean) => fetchDailySummary(today, force),
    onSuccess: (result) => queryClient.setQueryData(queryKey, result),
    onError: (err: any) => {
      Alert.alert("Couldn't generate summary", err.message || 'Something went wrong.');
    },
  });

  const summary = data?.summary;

  if (summary) {
    return (
      <View className="mx-4 mb-4 rounded-xl bg-neutral-100 p-4 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            Daily Summary
          </Text>
          <Pressable
            onPress={() => generate.mutate(true)}
            disabled={generate.isPending}
            accessibilityRole="button"
            accessibilityLabel="Generate summary again"
            className="min-h-11 flex-row items-center gap-1 px-2 disabled:opacity-50"
          >
            {generate.isPending ? (
              <ActivityIndicator size="small" />
            ) : (
              <>
                <Ionicons name="refresh" size={14} color="#737373" />
                <Text className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  Again
                </Text>
              </>
            )}
          </Pressable>
        </View>
        <Text className="text-sm text-neutral-600 dark:text-neutral-400">
          {summary}
        </Text>
      </View>
    );
  }

  return (
    <View className="mx-4 mb-4 rounded-xl bg-neutral-50 p-4 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 flex-row items-center justify-between">
      <Text className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
        Review your day
      </Text>
      <Pressable
        onPress={() => generate.mutate(false)}
        disabled={generate.isPending}
        className="flex-row items-center justify-center rounded-lg bg-neutral-900 px-3 py-1.5 dark:bg-neutral-50 disabled:opacity-50"
      >
        {generate.isPending ? (
          <ActivityIndicator size="small" color="#fff" className="dark:color-neutral-900" />
        ) : (
          <Text className="text-xs font-semibold text-white dark:text-neutral-900">
            Generate
          </Text>
        )}
      </Pressable>
    </View>
  );
}
