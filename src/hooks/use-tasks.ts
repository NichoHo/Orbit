import { useMutation, useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { ApiError, queryClient, unwrap } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { widgetStore } from '@/lib/storage';
import { cancelTaskNotification, scheduleTaskNotification } from '@/lib/notifications';
import type { Database } from '@/types/supabase';

export type Task = Database['public']['Tables']['tasks']['Row'];
export type TaskPriority = Database['public']['Enums']['task_priority'];

export const TASKS_KEY = ['tasks'] as const;

/**
 * Exactly the columns a client may write. Deliberately narrower than
 * TablesInsert: updated_at and created_at are server-authoritative (a DB
 * trigger owns updated_at, and conflict resolution reads it), and deleted_at
 * goes through softDeleteTask.
 */
export type TaskInput = {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  tags?: string[];
  estimated_min?: number | null;
  due_date?: string | null;
  completed_at?: string | null;
  parent_id?: string | null;
};

/**
 * Mint the id on the client, before the row has ever reached the server.
 * Two consequences, both required for offline-first: the row can be referenced
 * and edited while offline, and a replayed insert collides on the primary key
 * instead of creating a duplicate.
 */
export function newTaskId(): string {
  return Crypto.randomUUID();
}

// ─── api ────────────────────────────────────────────────────────────────────

async function fetchTasks(): Promise<Task[]> {
  const res = await supabase
    .from('tasks')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  
  const tasks = unwrap(res);
  const pendingCount = tasks.filter((t) => !t.completed_at).length;
  await widgetStore.set('pending_tasks_count', String(pendingCount));
  
  return tasks;
}

async function upsertTask(input: TaskInput): Promise<Task> {
  // upsert, not insert: makes a replayed mutation idempotent.
  const res = await supabase.from('tasks').upsert(input).select().single();
  return unwrap(res);
}

async function softDeleteTask({ id }: { id: string }): Promise<Task> {
  // Not .delete(). A tombstone survives sync (so an offline delete is not
  // resurrected by another device), keeps the row visible to the delta pull,
  // and emits an RLS-checked UPDATE rather than a DELETE that Realtime
  // broadcasts to every subscriber (blueprint §5.4).
  const res = await supabase
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return unwrap(res);
}

/**
 * Registered at module scope so a mutation restored from the persisted cache
 * can find its function again. A mutation persisted without a matching default is dropped
 * silently on restart — the single most common way an "offline-first" app
 * loses writes.
 */
queryClient.setMutationDefaults(['tasks', 'upsert'], { mutationFn: upsertTask });
queryClient.setMutationDefaults(['tasks', 'delete'], { mutationFn: softDeleteTask });

// ─── cache helpers ──────────────────────────────────────────────────────────

function writeTasks(update: (old: Task[]) => Task[]): void {
  queryClient.setQueryData<Task[]>(TASKS_KEY, (old = []) => update(old));
}

/**
 * Strip the server-owned columns so a whole Task can be edited and sent back.
 * updated_at in particular must never be client-supplied — a DB trigger owns it
 * and conflict resolution reads it.
 */
export function toInput(task: Task): TaskInput {
  const { created_at, updated_at, deleted_at, ...input } = task;
  return input;
}

// ─── hooks ──────────────────────────────────────────────────────────────────

export function useTasks() {
  return useQuery({ queryKey: TASKS_KEY, queryFn: fetchTasks });
}

export function useUpsertTask() {
  return useMutation({
    mutationKey: ['tasks', 'upsert'],
    mutationFn: upsertTask,

    onMutate: async (input: TaskInput) => {
      await queryClient.cancelQueries({ queryKey: TASKS_KEY });
      const previous = queryClient.getQueryData<Task[]>(TASKS_KEY);

      writeTasks((old) => {
        const existing = old.find((t) => t.id === input.id);
        const now = new Date().toISOString();
        // updated_at here is a placeholder for ordering in the UI only. The
        // server trigger sets the real value and onSuccess overwrites it.
        const next = {
          created_at: now,
          deleted_at: null,
          description: null,
          due_date: null,
          completed_at: null,
          estimated_min: null,
          parent_id: null,
          priority: 'medium' as TaskPriority,
          tags: [],
          fts: null,
          ...existing,
          ...input,
          updated_at: now,
        } satisfies Task;

        return existing ? old.map((t) => (t.id === input.id ? next : t)) : [next, ...old];
      });

      return { previous };
    },

    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(TASKS_KEY, context.previous);
    },

    onSuccess: (serverRow) => {
      // Canonical row: real updated_at, plus anything the DB computed.
      writeTasks((old) => old.map((t) => (t.id === serverRow.id ? serverRow : t)));

      // Notifications
      if (serverRow.completed_at || serverRow.deleted_at) {
        cancelTaskNotification(serverRow.id).catch(console.error);
      } else if (serverRow.due_date) {
        scheduleTaskNotification(
          serverRow.id,
          serverRow.title,
          new Date(serverRow.due_date)
        ).catch(console.error);
      } else {
        cancelTaskNotification(serverRow.id).catch(console.error);
      }
    },
  });
}

export function useSoftDeleteTask() {
  return useMutation({
    mutationKey: ['tasks', 'delete'],
    mutationFn: softDeleteTask,

    onMutate: async ({ id }: { id: string }) => {
      await queryClient.cancelQueries({ queryKey: TASKS_KEY });
      const previous = queryClient.getQueryData<Task[]>(TASKS_KEY);
      writeTasks((old) => old.filter((t) => t.id !== id));
      return { previous };
    },

    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(TASKS_KEY, context.previous);
    },

    onSuccess: (serverRow) => {
      cancelTaskNotification(serverRow.id).catch(console.error);
    },
  });
}

export { ApiError };
