create function private.increment_ai_usage(p_user_id uuid)
returns integer
language sql
security definer set search_path = ''
as $$
  insert into public.ai_usage (user_id, usage_date, calls)
  values (p_user_id, current_date, 1)
  on conflict (user_id, usage_date) do update set calls = ai_usage.calls + 1
  returning calls;
$$;

-- Create pg_cron schedule for nightly summaries
-- (Runs hourly, the Edge Function filters by the user's local timezone)
select cron.schedule(
  'nightly-summaries', '0 * * * *',
  $$ select net.http_post(
       url     := 'https://' || current_setting('app.project_ref') || '.supabase.co/functions/v1/daily-summary-batch',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
         'Content-Type',  'application/json')
     ) $$
);
