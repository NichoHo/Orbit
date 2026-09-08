import { supabase } from './supabase';
import { type Task } from '../hooks/use-tasks';

export async function fetchDailySummary(date: string): Promise<{ summary: string; cached: boolean }> {
  const { data, error } = await supabase.functions.invoke('daily-summary', {
    body: { date },
  });
  if (error) throw error;
  return data;
}

export async function decomposeTask(goalTaskId: string, goalTitle: string): Promise<{ subtasks: Partial<Task>[] }> {
  const { data, error } = await supabase.functions.invoke('decompose-task', {
    body: { goalTaskId, goalTitle },
  });
  if (error) throw error;
  return data;
}
