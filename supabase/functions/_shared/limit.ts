import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const DAILY_LIMIT = 20;

export async function consumeQuota(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin.rpc('increment_ai_usage', { p_user_id: userId });
  if (error) throw error;
  if (data > DAILY_LIMIT) {
    throw new Response(JSON.stringify({ error: 'daily_limit_reached' }), { status: 429 });
  }
}
