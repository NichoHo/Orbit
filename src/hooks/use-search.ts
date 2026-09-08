import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/query';
import type { Task } from './use-tasks';

export function useTaskSearch(query: string) {
  return useQuery({
    queryKey: ['tasks', 'search', query],
    queryFn: async () => {
      if (!query || query.trim().length === 0) return [];

      const res = await supabase
        .from('tasks')
        .select('*')
        .is('deleted_at', null)
        .textSearch('fts', query, {
          type: 'websearch',
          config: 'english'
        })
        .order('created_at', { ascending: false })
        .limit(50);
        
      return unwrap(res) as Task[];
    },
    enabled: query.trim().length > 0,
  });
}
