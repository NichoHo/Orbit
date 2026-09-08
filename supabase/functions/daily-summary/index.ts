import { clientFor, serviceRoleClient } from '../_shared/client.ts';
import { consumeQuota } from '../_shared/limit.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
  }

  try {
    const supabase = clientFor(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

    const { date } = await req.json();
    if (!date) {
      return new Response('Date is required', { status: 400 });
    }

    // Cache hit -> free.
    const { data: cached } = await supabase
      .from('daily_summaries').select('ai_summary')
      .eq('summary_date', date).maybeSingle();
    
    if (cached?.ai_summary) {
      return Response.json({ summary: cached.ai_summary, cached: true }, { headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const admin = serviceRoleClient();
    await consumeQuota(admin, user.id);

    // RLS scopes these to the caller
    const [{ data: tasks }, { data: entries }] = await Promise.all([
      supabase.from('tasks').select('title, priority, completed_at')
        .gte('completed_at', `${date}T00:00:00Z`).lt('completed_at', `${date}T23:59:59Z`)
        .is('deleted_at', null),
      supabase.from('habit_entries').select('count, habits(title)')
        .eq('entry_date', date).is('deleted_at', null),
    ]);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 400,
        system: 'Summarize the day in 2-3 sentences. Direct, specific, no preamble. ' +
                'Name what got done. If nothing did, say so plainly without encouragement.',
        messages: [{ role: 'user', content: JSON.stringify({ tasks, entries }) }],
      }),
    });
    
    if (!res.ok) {
      const err = await res.text();
      console.error('AI provider error:', err);
      return new Response('AI provider error', { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const summary = (await res.json()).content[0].text;

    await supabase.from('daily_summaries').upsert(
      { user_id: user.id, summary_date: date, ai_summary: summary,
        ai_model: 'claude-3-5-sonnet-20240620', generated_at: new Date().toISOString() },
      { onConflict: 'user_id,summary_date' },
    );

    return Response.json({ summary, cached: false }, { headers: { 'Access-Control-Allow-Origin': '*' } });
  } catch (error: any) {
    console.error(error);
    return new Response(error.message ?? 'Internal error', { status: error.status ?? 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
});
