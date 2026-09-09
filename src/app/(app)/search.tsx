import { useState } from 'react';
import { View, TextInput, FlatList, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTaskSearch } from '@/hooks/use-search';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const { data: tasks, isLoading } = useTaskSearch(query);
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-4 py-2 border-b border-gray-200 flex-row items-center">
        <TextInput
          // fontSize in style, not the text-base className — avoids the iOS
          // lineHeight clip on focus (see sign-in.tsx).
          style={{ fontSize: 16 }}
          className="flex-1 h-10 bg-gray-100 rounded-lg px-3 text-gray-900"
          placeholder="Search tasks..."
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
          clearButtonMode="always"
        />
        <Pressable onPress={() => router.back()} className="ml-4">
          <Text className="text-blue-600 font-medium">Cancel</Text>
        </Pressable>
      </View>

      {isLoading && query.length > 0 && (
        <View className="p-4">
          <Text className="text-gray-500">Searching...</Text>
        </View>
      )}

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-4"
        renderItem={({ item }) => (
          <Pressable 
            onPress={() => router.push(`/task/${item.id}`)}
            className="py-3 border-b border-gray-100"
          >
            <Text className="text-base text-gray-900 font-medium">{item.title}</Text>
            {item.description ? (
              <Text className="text-sm text-gray-500 mt-1" numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </Pressable>
        )}
        ListEmptyComponent={
          query.length > 0 && !isLoading ? (
            <Text className="text-gray-500 mt-4 text-center">No tasks found</Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
