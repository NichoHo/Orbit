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

    const { goalTaskId, goalTitle } = await req.json();
    if (!goalTaskId || !goalTitle) {
      return new Response('goalTaskId and goalTitle are required', { status: 400 });
    }

    const admin = serviceRoleClient();
    await consumeQuota(admin, user.id);

    // Prompt Anthropic to return JSON
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 1000,
        system: `You are an expert task decomposer. Break down the user's goal into atomic, actionable subtasks.
Return ONLY valid JSON in this exact structure, with no markdown formatting or extra text:
{
  "subtasks": [
    { "title": "...", "estimated_min": 15 }
  ]
}`,
        messages: [{ role: 'user', content: `Goal: ${goalTitle}` }],
      }),
    });
    
    if (!res.ok) {
      return new Response('AI provider error', { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const jsonText = (await res.json()).content[0].text;
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      return new Response('Failed to parse AI response', { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const subtasks = (parsed.subtasks || [])
      .filter((s: any) => typeof s.title === 'string' && s.title.trim().length > 0)
      .slice(0, 12)
      .map((s: any) => ({
        id: crypto.randomUUID(),
        user_id: user.id,
        parent_id: goalTaskId,
        title: s.title.trim().slice(0, 500),
        estimated_min: Number.isFinite(s.estimated_min)
          ? Math.min(Math.max(1, s.estimated_min), 480)
          : null,
      }));

    return Response.json({ subtasks }, { headers: { 'Access-Control-Allow-Origin': '*' } });
  } catch (error: any) {
    console.error(error);
    return new Response(error.message ?? 'Internal error', { status: error.status ?? 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
});
