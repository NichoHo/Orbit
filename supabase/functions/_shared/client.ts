import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import type { Database } from '../../src/types/supabase.ts'; // assuming deno resolves this

export function clientFor(req: Request): SupabaseClient<Database> {
  const authorization = req.headers.get('Authorization');
  if (!authorization) throw new Response('Unauthorized', { status: 401 });

  return createClient<Database>(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },  // RLS applies
  );
}

export function serviceRoleClient(): SupabaseClient<Database> {
  return createClient<Database>(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}
