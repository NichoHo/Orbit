import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// No Database generic: it would type-import across the deploy boundary from
// src/types/supabase.ts, which isn't part of this function's uploaded file
// set. Harmless at runtime (type-only imports are erased), but fragile to
// depend on that during deploy — not worth it for a generic edge functions
// use only for .auth and .rpc calls, not typed table queries.

export function clientFor(req: Request): SupabaseClient {
  const authorization = req.headers.get('Authorization');
  if (!authorization) throw new Response('Unauthorized', { status: 401 });

  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },  // RLS applies
  );
}

export function serviceRoleClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}
