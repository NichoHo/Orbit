import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

export type AddTaskRowHandle = { focus: () => void };

/**
 * The list's own "tap here to add" row, styled like a task row so it reads
 * as the natural next line rather than a separate toolbar. Chain-adds: submitting
 * clears the input and keeps it focused so a fast multi-add doesn't need a re-tap.
 */
export const AddTaskRow = forwardRef<AddTaskRowHandle, { onSubmit: (title: string) => void }>(
  function AddTaskRow({ onSubmit }, ref) {
    const [active, setActive] = useState(false);
    const [text, setText] = useState('');
    const inputRef = useRef<TextInput>(null);

    function open() {
      setActive(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    }

    useImperativeHandle(ref, () => ({ focus: open }));

    function submitAndContinue() {
      const trimmed = text.trim();
      if (!trimmed) return;
      onSubmit(trimmed);
      setText('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }

    function submitAndClose() {
      const trimmed = text.trim();
      if (trimmed) onSubmit(trimmed);
      setText('');
      setActive(false);
    }

    if (!active) {
      return (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel="Add a task"
          className="min-h-14 flex-row items-center gap-3 px-4"
        >
          <Ionicons name="add-circle" size={24} color="#2563eb" />
          <Text className="flex-1 text-base text-neutral-400 dark:text-neutral-500">
            Add a Reminder
          </Text>
        </Pressable>
      );
    }

    return (
      <View className="min-h-14 flex-row items-center gap-3 px-4">
        <Ionicons name="add-circle" size={24} color="#2563eb" />
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submitAndContinue}
          onBlur={submitAndClose}
          placeholder="Add a Reminder"
          accessibilityLabel="New task title"
          returnKeyType="done"
          blurOnSubmit={false}
          // fontSize in style, not the text-base className — avoids the iOS
          // lineHeight clip on focus (see sign-in.tsx).
          style={{ fontSize: 16 }}
          className="flex-1 text-neutral-900 dark:text-neutral-50"
        />
      </View>
    );
  },
);
