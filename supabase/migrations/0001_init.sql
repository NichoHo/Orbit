-- Orbit — initial schema
-- Implements blueprint.md §4. See that file for the reasoning behind each choice.
--
-- Not included, deliberately:
--   • public.habit_streaks view (§4.8) — derived data, unused until Phase 3, and
--     the only piece here that cannot be verified without real entries. Add it in
--     Phase 3 WITH (security_invoker = true), which is not optional.
--   • private.increment_ai_usage (§7.2) — Phase 4. Note: supabase.rpc() can only
--     reach functions in an exposed schema, so that function cannot live in
--     `private` as §7.2 currently shows. Resolve when Phase 4 builds it.

-- ─── types ──────────────────────────────────────────────────────────────────
-- gen_random_uuid() is core Postgres 13+. No uuid-ossp extension needed.

create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.habit_cadence  as enum ('daily', 'weekly');


-- ─── trigger functions (non-exposed schema) ─────────────────────────────────
-- A `security definer` function in `public` is granted EXECUTE to PUBLIC by
-- default, making it a callable endpoint for every signed-in user. These live
-- in `private`, which is not exposed via the Data API.

create schema if not exists private;

-- updated_at is server-authoritative. Never accept it from the client: conflict
-- resolution reads it, and a device with a skewed clock would otherwise win
-- every write permanently.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


-- ─── profiles ───────────────────────────────────────────────────────────────

create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  avatar_url  text,

  -- Written at sign-in from Intl.DateTimeFormat().resolvedOptions().timeZone.
  -- The default is a fallback, NOT the expected value: the Phase 4 summary cron
  -- reads this to decide when a user's day ends. Left at 'UTC' it silently
  -- delivers every user's "daily" summary at 21:00 UTC.
  timezone    text not null default 'UTC',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger touch_profiles before update on public.profiles
  for each row execute function private.touch_updated_at();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();


-- ─── tasks ──────────────────────────────────────────────────────────────────

create table public.tasks (
  -- Client mints this UUID before the row ever reaches the server, so an offline
  -- client can reference it and a replayed INSERT is idempotent (PK conflict =
  -- already synced). The default only covers server-side inserts.
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,

  title         text not null check (length(trim(title)) between 1 and 500),
  description   text check (length(description) <= 10000),
  priority      public.task_priority not null default 'medium',
  tags          text[] not null default '{}',
  estimated_min integer check (estimated_min is null or estimated_min between 1 and 10080),

  due_date      timestamptz,
  -- null = open. Carries "when", which the Phase 4 summary needs.
  completed_at  timestamptz,

  parent_id     uuid references public.tasks(id) on delete cascade,

  -- Soft delete (§5.4). Realtime does not apply RLS to DELETE events and cannot
  -- filter them, so a hard delete broadcasts row IDs to every subscriber.
  -- Setting deleted_at emits an UPDATE instead: RLS-checked and filterable.
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger touch_tasks before update on public.tasks
  for each row execute function private.touch_updated_at();


-- ─── habits ─────────────────────────────────────────────────────────────────

create table public.habits (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,

  title             text not null check (length(trim(title)) between 1 and 200),
  cadence           public.habit_cadence not null default 'daily',
  target_per_period smallint not null default 1 check (target_per_period between 1 and 100),
  color             text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at       timestamptz,

  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Target for the composite FK on habit_entries below.
  unique (id, user_id)
);

create trigger touch_habits before update on public.habits
  for each row execute function private.touch_updated_at();


-- ─── habit_entries ──────────────────────────────────────────────────────────

create table public.habit_entries (
  id         uuid primary key default gen_random_uuid(),
  habit_id   uuid not null,

  -- Denormalized so RLS is an indexed comparison rather than a subquery against
  -- habits on every row. The composite FK below makes Postgres guarantee it
  -- always matches the parent — no trigger, no application code.
  user_id    uuid not null references public.profiles(id) on delete cascade,

  entry_date date not null,
  count      smallint not null default 1 check (count > 0),
  note       text check (length(note) <= 1000),

  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (habit_id, user_id)
    references public.habits(id, user_id) on delete cascade,

  -- One row per habit per day. Makes offline sync an idempotent upsert.
  unique (habit_id, entry_date)
);

create trigger touch_habit_entries before update on public.habit_entries
  for each row execute function private.touch_updated_at();


-- ─── daily_summaries ────────────────────────────────────────────────────────
-- Doubles as the AI summary cache and the user's "daily context" note.

create table public.daily_summaries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  summary_date date not null,

  user_note    text check (length(user_note) <= 5000),
  ai_summary   text,
  ai_model     text,
  generated_at timestamptz,

  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- The cache key. A second request for the same day costs nothing.
  unique (user_id, summary_date)
);

create trigger touch_daily_summaries before update on public.daily_summaries
  for each row execute function private.touch_updated_at();


-- ─── ai_usage ───────────────────────────────────────────────────────────────
-- Rate limiting is a trust boundary, not an optimization. RLS is enabled with
-- NO policies: default-deny. The client cannot read or forge it.

create table public.ai_usage (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null default current_date,
  calls      integer not null default 0,
  primary key (user_id, usage_date)
);


-- ─── indexes ────────────────────────────────────────────────────────────────
-- An RLS policy filtering an unindexed column is a sequential scan per query.

create index tasks_user_live_idx
  on public.tasks (user_id, created_at desc)
  where deleted_at is null;

-- Delta-sync pull must see tombstones, so no partial predicate here.
create index tasks_user_updated_idx   on public.tasks         (user_id, updated_at);
create index habits_user_updated_idx  on public.habits        (user_id, updated_at);
create index entries_user_updated_idx on public.habit_entries (user_id, updated_at);

create index tasks_user_due_idx
  on public.tasks (user_id, due_date)
  where deleted_at is null and completed_at is null;

create index tasks_parent_idx on public.tasks (parent_id) where parent_id is not null;
create index entries_habit_date_idx on public.habit_entries (habit_id, entry_date desc);
create index tasks_tags_idx on public.tasks using gin (tags);

create index summaries_user_date_idx on public.daily_summaries (user_id, summary_date desc);


-- ─── row level security ─────────────────────────────────────────────────────

alter table public.profiles        enable row level security;
alter table public.tasks           enable row level security;
alter table public.habits          enable row level security;
alter table public.habit_entries   enable row level security;
alter table public.daily_summaries enable row level security;
alter table public.ai_usage        enable row level security;

-- profiles: no INSERT policy (rows come from the auth trigger),
--           no DELETE policy (cascades from auth.users).
create policy "profiles: select own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using      ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Owned tables. Four things this shape gets right that
-- `for all using (auth.uid() = user_id)` does not:
--   • (select auth.uid()) evaluates once as an initPlan, not once per row
--   • explicit WITH CHECK on UPDATE blocks reassigning user_id to another user
--   • TO authenticated scopes the policy to the role (auth.role() is deprecated
--     and passes silently for anonymous sign-ins)
--   • split by command, so DELETE can be revoked independently later
do $$
declare t text;
begin
  foreach t in array array['tasks', 'habits', 'habit_entries', 'daily_summaries']
  loop
    execute format($f$
      create policy "%1$s: select own" on public.%1$I
        for select to authenticated
        using ((select auth.uid()) = user_id);

      create policy "%1$s: insert own" on public.%1$I
        for insert to authenticated
        with check ((select auth.uid()) = user_id);

      create policy "%1$s: update own" on public.%1$I
        for update to authenticated
        using      ((select auth.uid()) = user_id)
        with check ((select auth.uid()) = user_id);

      create policy "%1$s: delete own" on public.%1$I
        for delete to authenticated
        using ((select auth.uid()) = user_id);
    $f$, t);
  end loop;
end $$;


-- ─── Data API exposure ──────────────────────────────────────────────────────
-- Newly created tables are not always auto-exposed. ai_usage gets no grant at
-- all — it is unreachable from the client.

grant select, insert, update, delete
  on public.tasks, public.habits, public.habit_entries, public.daily_summaries
  to authenticated;

grant select, update on public.profiles to authenticated;


-- ─── realtime ───────────────────────────────────────────────────────────────
-- daily_summaries is deliberately excluded: pulled on demand, no live channel.

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.habits;
alter publication supabase_realtime add table public.habit_entries;

-- Needed so UPDATE payloads carry the old row, used to detect the
-- null → not-null transition on deleted_at.
alter table public.tasks         replica identity full;
alter table public.habits        replica identity full;
alter table public.habit_entries replica identity full;
