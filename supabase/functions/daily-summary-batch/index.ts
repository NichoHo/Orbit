import { serviceRoleClient } from '../_shared/client.ts';

// Note: This endpoint is called by pg_cron, not by a user client.
// It uses the service role key internally to fetch profiles, but we authenticate
// the cron job using a Bearer token that matches a custom setting or secret.
Deno.serve(async (req) => {
  const authorization = req.headers.get('Authorization');
  // Simple check for cron secret
  if (authorization !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const admin = serviceRoleClient();

  // Find users where their local time has crossed 21:00 today.
  // We can just call an RPC or do a query, but since timezone is text, we can fetch
  // profiles and calculate, or better, query profiles where extract hour is 21.
  // Actually, let's fetch all users and filter in Deno for simplicity if the list is small,
  // or use a supabase query. Let's use a simple approach:
  const { data: profiles, error } = await admin.from('profiles').select('id, timezone');
  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const nowUTC = new Date();
  
  const usersToSummarize = (profiles || []).filter(p => {
    try {
      const tzStr = p.timezone || 'UTC';
      const userDate = new Date(nowUTC.toLocaleString('en-US', { timeZone: tzStr }));
      // If user's local time is 9 PM (21:xx)
      return userDate.getHours() === 21;
    } catch {
      return false;
    }
  });

  const results = [];
  
  for (const user of usersToSummarize) {
    // We get their local date string (YYYY-MM-DD)
    const tzStr = user.timezone || 'UTC';
    const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: tzStr });
    const localDateStr = formatter.format(nowUTC); // sv-SE outputs YYYY-MM-DD
    
    // Instead of duplicating the daily-summary logic, we can just invoke it.
    // However, daily-summary expects a JWT. 
    // We can just duplicate the logic here since we have the service role client,
    // OR we can sign a short-lived JWT for the user.
    // Since duplicating the logic with admin client breaks RLS, wait.
    // Let's just do it directly with admin client, adding .eq('user_id', user.id).
    
    try {
      // Check cache
      const { data: cached } = await admin
        .from('daily_summaries').select('ai_summary')
        .eq('user_id', user.id)
        .eq('summary_date', localDateStr).maybeSingle();
      
      if (cached?.ai_summary) {
        results.push({ userId: user.id, status: 'cached' });
        continue;
      }

      const [{ data: tasks }, { data: entries }] = await Promise.all([
        admin.from('tasks').select('title, priority, completed_at')
          .eq('user_id', user.id)
          .gte('completed_at', `${localDateStr}T00:00:00Z`).lt('completed_at', `${localDateStr}T23:59:59Z`)
          .is('deleted_at', null),
        admin.from('habit_entries').select('count, habits(title)')
          .eq('user_id', user.id)
          .eq('entry_date', localDateStr).is('deleted_at', null),
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
        results.push({ userId: user.id, status: 'error', error: await res.text() });
        continue;
      }

      const summary = (await res.json()).content[0].text;

      await admin.from('daily_summaries').upsert(
        { user_id: user.id, summary_date: localDateStr, ai_summary: summary,
          ai_model: 'claude-3-5-sonnet-20240620', generated_at: new Date().toISOString() },
        { onConflict: 'user_id,summary_date' },
      );
      
      results.push({ userId: user.id, status: 'success' });
    } catch (err: any) {
      results.push({ userId: user.id, status: 'error', error: err.message });
    }
  }

  return Response.json({ results });
});
