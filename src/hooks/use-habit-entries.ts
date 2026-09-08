import { useMutation, useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { queryClient, unwrap } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/supabase';

export type HabitEntry = Database['public']['Tables']['habit_entries']['Row'];

export const HABIT_ENTRIES_KEY = ['habit_entries'] as const;

export type HabitEntryInput = {
  id: string;
  habit_id: string;
  user_id: string;
  entry_date: string;
  count?: number;
  note?: string | null;
};

export function newHabitEntryId(): string {
  return Crypto.randomUUID();
}

// ─── api ────────────────────────────────────────────────────────────────────

async function fetchHabitEntries(): Promise<HabitEntry[]> {
  const res = await supabase
    .from('habit_entries')
    .select('*')
    .is('deleted_at', null)
    .order('entry_date', { ascending: false });
  return unwrap(res);
}

async function upsertHabitEntry(input: HabitEntryInput): Promise<HabitEntry> {
  const res = await supabase.from('habit_entries').upsert(input).select().single();
  return unwrap(res);
}

async function softDeleteHabitEntry({ id }: { id: string }): Promise<HabitEntry> {
  const res = await supabase
    .from('habit_entries')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return unwrap(res);
}

queryClient.setMutationDefaults(['habit_entries', 'upsert'], { mutationFn: upsertHabitEntry });
queryClient.setMutationDefaults(['habit_entries', 'delete'], { mutationFn: softDeleteHabitEntry });

// ─── cache helpers ──────────────────────────────────────────────────────────

function writeHabitEntries(update: (old: HabitEntry[]) => HabitEntry[]): void {
  queryClient.setQueryData<HabitEntry[]>(HABIT_ENTRIES_KEY, (old = []) => update(old));
}

export function toHabitEntryInput(entry: HabitEntry): HabitEntryInput {
  const { created_at, updated_at, deleted_at, ...input } = entry;
  return input;
}

// ─── hooks ──────────────────────────────────────────────────────────────────

export function useHabitEntries() {
  return useQuery({ queryKey: HABIT_ENTRIES_KEY, queryFn: fetchHabitEntries });
}

export function useUpsertHabitEntry() {
  return useMutation({
    mutationKey: ['habit_entries', 'upsert'],
    mutationFn: upsertHabitEntry,

    onMutate: async (input: HabitEntryInput) => {
      await queryClient.cancelQueries({ queryKey: HABIT_ENTRIES_KEY });
      const previous = queryClient.getQueryData<HabitEntry[]>(HABIT_ENTRIES_KEY);

      writeHabitEntries((old) => {
        const existing = old.find((e) => e.habit_id === input.habit_id && e.entry_date === input.entry_date);
        const now = new Date().toISOString();
        const next = {
          created_at: now,
          deleted_at: null,
          count: 1,
          note: null,
          ...existing,
          ...input,
          updated_at: now,
        } satisfies HabitEntry;

        return existing ? old.map((e) => (e.id === existing.id ? next : e)) : [...old, next];
      });

      return { previous };
    },

    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(HABIT_ENTRIES_KEY, context.previous);
    },

    onSuccess: (serverRow) => {
      writeHabitEntries((old) => old.map((e) => (e.id === serverRow.id ? serverRow : e)));
    },
  });
}

export function useSoftDeleteHabitEntry() {
  return useMutation({
    mutationKey: ['habit_entries', 'delete'],
    mutationFn: softDeleteHabitEntry,

    onMutate: async ({ id }: { id: string }) => {
      await queryClient.cancelQueries({ queryKey: HABIT_ENTRIES_KEY });
      const previous = queryClient.getQueryData<HabitEntry[]>(HABIT_ENTRIES_KEY);
      writeHabitEntries((old) => old.filter((e) => e.id !== id));
      return { previous };
    },

    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(HABIT_ENTRIES_KEY, context.previous);
    },
  });
}
