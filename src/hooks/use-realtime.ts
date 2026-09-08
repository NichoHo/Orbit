import { useEffect } from 'react';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { applyRealtimeRow } from '@/lib/sync-merge';
import { useAuth } from './use-auth';

import { TASKS_KEY, type Task } from './use-tasks';
import { HABITS_KEY, type Habit } from './use-habits';
import { HABIT_ENTRIES_KEY, type HabitEntry } from './use-habit-entries';

function isPending(id: string): boolean {
  return queryClient
    .getMutationCache()
    .getAll()
    .some((m) => m.state.status === 'pending' && (m.state.variables as any)?.id === id);
}

export function useRealtime() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session) return;
    
    const filter = `user_id=eq.${session.user.id}`;
    
    const channel = supabase
      .channel('orbit-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter },
        ({ new: row }) => {
          if (!(row as any)?.id) return;
          queryClient.setQueryData<Task[]>(TASKS_KEY, (old = []) =>
            applyRealtimeRow(old, row as Task, isPending),
          );
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'habits', filter },
        ({ new: row }) => {
          if (!(row as any)?.id) return;
          queryClient.setQueryData<Habit[]>(HABITS_KEY, (old = []) =>
            applyRealtimeRow(old, row as Habit, isPending),
          );
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'habit_entries', filter },
        ({ new: row }) => {
          if (!(row as any)?.id) return;
          queryClient.setQueryData<HabitEntry[]>(HABIT_ENTRIES_KEY, (old = []) =>
            applyRealtimeRow(old, row as HabitEntry, isPending),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user.id]);
}
