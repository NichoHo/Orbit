import { supabase } from './supabase';

// supabase-js's FunctionsHttpError.message is always the generic "Edge
// Function returned a non-2xx status code" — the function's actual response
// body (what it deliberately returned, or what the AI provider said) is on
// error.context, a Response that hasn't been read yet.
async function unwrapFunctionError(error: any): Promise<never> {
  if (error?.context instanceof Response) {
    const body = await error.context.text().catch(() => '');
    throw new Error(body || error.message);
  }
  throw error;
}

// force skips the server-side cache so "Again" gets a fresh summary instead
// of the one already stored for today.
export async function fetchDailySummary(date: string, force = false): Promise<{ summary: string; cached: boolean }> {
  const { data, error } = await supabase.functions.invoke('daily-summary', {
    body: { date, force },
  });
  if (error) await unwrapFunctionError(error);
  return data;
}
