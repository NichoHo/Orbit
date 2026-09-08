import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { Task } from '@/hooks/use-tasks';

export async function exportTasksToCSV(tasks: Task[]) {
  if (tasks.length === 0) return;

  const header = ['ID', 'Title', 'Description', 'Priority', 'Status', 'Due Date', 'Created At'].join(',');
  const rows = tasks.map(t => {
    const status = t.completed_at ? 'Completed' : 'Pending';
    const due = t.due_date ? new Date(t.due_date).toISOString() : '';
    const created = new Date(t.created_at).toISOString();
    // Escape quotes and commas
    const title = `"${t.title.replace(/"/g, '""')}"`;
    const desc = t.description ? `"${t.description.replace(/"/g, '""')}"` : '';
    return [t.id, title, desc, t.priority, status, due, created].join(',');
  });

  const csv = [header, ...rows].join('\n');
  const fileUri = `${FileSystem.documentDirectory}orbit_tasks.csv`;

  await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/csv',
      dialogTitle: 'Export Tasks',
      UTI: 'public.comma-separated-values-text',
    });
  }
}
