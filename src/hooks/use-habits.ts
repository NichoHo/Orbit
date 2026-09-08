import { useMutation, useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { queryClient, unwrap } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/supabase';

export type Habit = Database['public']['Tables']['habits']['Row'];
export type HabitCadence = Database['public']['Enums']['habit_cadence'];

export const HABITS_KEY = ['habits'] as const;

export type HabitInput = {
  id: string;
  user_id: string;
  title: string;
  cadence?: HabitCadence;
  target_per_period?: number;
  color?: string;
  archived_at?: string | null;
};

export function newHabitId(): string {
  return Crypto.randomUUID();
}

// ─── api ────────────────────────────────────────────────────────────────────

async function fetchHabits(): Promise<Habit[]> {
  const res = await supabase
    .from('habits')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  return unwrap(res);
}

async function upsertHabit(input: HabitInput): Promise<Habit> {
  const res = await supabase.from('habits').upsert(input).select().single();
  return unwrap(res);
}

async function softDeleteHabit({ id }: { id: string }): Promise<Habit> {
  const res = await supabase
    .from('habits')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return unwrap(res);
}

queryClient.setMutationDefaults(['habits', 'upsert'], { mutationFn: upsertHabit });
queryClient.setMutationDefaults(['habits', 'delete'], { mutationFn: softDeleteHabit });

// ─── cache helpers ──────────────────────────────────────────────────────────

function writeHabits(update: (old: Habit[]) => Habit[]): void {
  queryClient.setQueryData<Habit[]>(HABITS_KEY, (old = []) => update(old));
}

export function toHabitInput(habit: Habit): HabitInput {
  const { created_at, updated_at, deleted_at, ...input } = habit;
  return input;
}

// ─── hooks ──────────────────────────────────────────────────────────────────

export function useHabits() {
  return useQuery({ queryKey: HABITS_KEY, queryFn: fetchHabits });
}

export function useUpsertHabit() {
  return useMutation({
    mutationKey: ['habits', 'upsert'],
    mutationFn: upsertHabit,

    onMutate: async (input: HabitInput) => {
      await queryClient.cancelQueries({ queryKey: HABITS_KEY });
      const previous = queryClient.getQueryData<Habit[]>(HABITS_KEY);

      writeHabits((old) => {
        const existing = old.find((h) => h.id === input.id);
        const now = new Date().toISOString();
        const next = {
          created_at: now,
          deleted_at: null,
          archived_at: null,
          cadence: 'daily' as HabitCadence,
          target_per_period: 1,
          color: '#6366f1',
          ...existing,
          ...input,
          updated_at: now,
        } satisfies Habit;

        return existing ? old.map((h) => (h.id === input.id ? next : h)) : [...old, next];
      });

      return { previous };
    },

    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(HABITS_KEY, context.previous);
    },

    onSuccess: (serverRow) => {
      writeHabits((old) => old.map((h) => (h.id === serverRow.id ? serverRow : h)));
    },
  });
}

export function useSoftDeleteHabit() {
  return useMutation({
    mutationKey: ['habits', 'delete'],
    mutationFn: softDeleteHabit,

    onMutate: async ({ id }: { id: string }) => {
      await queryClient.cancelQueries({ queryKey: HABITS_KEY });
      const previous = queryClient.getQueryData<Habit[]>(HABITS_KEY);
      writeHabits((old) => old.filter((h) => h.id !== id));
      return { previous };
    },

    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(HABITS_KEY, context.previous);
    },
  });
}
