import { clientFor, serviceRoleClient } from '../_shared/client.ts';
import { consumeQuota } from '../_shared/limit.ts';
import { computeStreak } from '../_shared/streaks.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
  }

  try {
    const supabase = clientFor(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

    const { date, force } = await req.json();
    if (!date) {
      return new Response('Date is required', { status: 400 });
    }

    // Cache hit -> free. force skips this so "Again" gets a fresh summary
    // instead of the one already stored for today.
    if (!force) {
      const { data: cached } = await supabase
        .from('daily_summaries').select('ai_summary')
        .eq('summary_date', date).maybeSingle();

      if (cached?.ai_summary) {
        return Response.json({ summary: cached.ai_summary, cached: true }, { headers: { 'Access-Control-Allow-Origin': '*' } });
      }
    }

    const admin = serviceRoleClient();
    await consumeQuota(admin, user.id);

    // RLS scopes these to the caller. habit_entries is fetched with no date
    // filter (not just `date`) because computeStreak needs history, not a
    // single day: a lone day's count can't tell the AI it's on a streak.
    const [{ data: tasks }, { data: habits }, { data: habitEntries }] = await Promise.all([
      supabase.from('tasks').select('title, priority, completed_at')
        .gte('completed_at', `${date}T00:00:00Z`).lt('completed_at', `${date}T23:59:59Z`)
        .is('deleted_at', null),
      supabase.from('habits').select('id, title, cadence, target_per_period').is('deleted_at', null),
      supabase.from('habit_entries').select('habit_id, entry_date').is('deleted_at', null),
    ]);

    const entryDatesByHabit = new Map<string, Set<string>>();
    for (const e of habitEntries ?? []) {
      if (!entryDatesByHabit.has(e.habit_id)) entryDatesByHabit.set(e.habit_id, new Set());
      entryDatesByHabit.get(e.habit_id)!.add(e.entry_date);
    }

    // Streak is computed here, not left for the model to infer from raw
    // entries: that's what was producing invented numbers ("prayed twice").
    const habitSummaries = (habits ?? []).map((h) => {
      const dates = entryDatesByHabit.get(h.id) ?? new Set<string>();
      return {
        title: h.title,
        cadence: h.cadence,
        streak: computeStreak(h, dates, date),
        completed_today: dates.has(date),
      };
    });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: 'Summarize the day in 2-3 sentences. Direct, specific, no preamble. ' +
                'Name what got done. Each habit\'s "streak" and "completed_today" are already ' +
                'computed for you: state them plainly (e.g. "2-week streak"), never invent a ' +
                'different number or guess how many times something happened. ' +
                'If nothing did, say so plainly without encouragement.',
        messages: [{ role: 'user', content: JSON.stringify({ tasks, habits: habitSummaries }) }],
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
        ai_model: 'claude-haiku-4-5-20251001', generated_at: new Date().toISOString() },
      { onConflict: 'user_id,summary_date' },
    );

    return Response.json({ summary, cached: false }, { headers: { 'Access-Control-Allow-Origin': '*' } });
  } catch (error: any) {
    console.error(error);
    return new Response(error.message ?? 'Internal error', { status: error.status ?? 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
});
