-- updated_at was server-authoritative on UPDATE but not on INSERT. The column
-- merely defaulted, so a client posting directly to PostgREST could insert with
-- updated_at = '2099-01-01', and that row would then win every last-write-wins
-- merge (§5.6) forever and match every delta-pull cursor (§5.5).
--
-- The app's TaskInput type already omits the column, but the client is not the
-- security boundary — the database is. Found by the Phase 2 sync-mechanics
-- check, which plants a bogus timestamp and asserts the server overwrites it.

drop trigger touch_profiles on public.profiles;
drop trigger touch_tasks on public.tasks;
drop trigger touch_habits on public.habits;
drop trigger touch_habit_entries on public.habit_entries;
drop trigger touch_daily_summaries on public.daily_summaries;

create trigger touch_profiles before insert or update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger touch_tasks before insert or update on public.tasks
  for each row execute function private.touch_updated_at();
create trigger touch_habits before insert or update on public.habits
  for each row execute function private.touch_updated_at();
create trigger touch_habit_entries before insert or update on public.habit_entries
  for each row execute function private.touch_updated_at();
create trigger touch_daily_summaries before insert or update on public.daily_summaries
  for each row execute function private.touch_updated_at();

-- Note for anyone writing further checks: now() is transaction-scoped, so two
-- writes inside one transaction share an updated_at. That is correct for
-- production (each PostgREST request is its own transaction) but means
-- "did the timestamp advance?" can never pass inside a single DO block.
-- Assert that a planted value was overwritten instead.
