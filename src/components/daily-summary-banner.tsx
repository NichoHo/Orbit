import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { fetchDailySummary } from '@/lib/ai';

export function DailySummaryBanner() {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSummary() {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().split('T')[0]!;
      const result = await fetchDailySummary(today);
      setSummary(result.summary);
    } catch (err: any) {
      setError(err.message || 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  }

  if (summary) {
    return (
      <View className="mx-4 mb-4 rounded-xl bg-neutral-100 p-4 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
        <Text className="text-sm font-medium text-neutral-900 dark:text-neutral-50 mb-1">
          Daily Summary
        </Text>
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
        onPress={loadSummary}
        disabled={loading}
        className="flex-row items-center justify-center rounded-lg bg-neutral-900 px-3 py-1.5 dark:bg-neutral-50 disabled:opacity-50"
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" className="dark:color-neutral-900" />
        ) : (
          <Text className="text-xs font-semibold text-white dark:text-neutral-900">
            Generate
          </Text>
        )}
      </Pressable>
      {error && <Text className="text-xs text-red-500 mt-2">{error}</Text>}
    </View>
  );
}
