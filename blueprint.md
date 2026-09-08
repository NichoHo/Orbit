# Orbit — Technical Blueprint

**Offline-first, real-time task & habit engine with AI assistance.**

> Revision date: 2026-08-01. Supersedes the initial concept doc.
> Locked by constraint: project name, core idea, tech stack. Everything else optimized.

---

## 0. What changed from the concept doc, and why

Read this section first. It is the delta.

| # | Change | Reason |
|---|--------|--------|
| 1 | **Dropped WatermelonDB. MMKV only.** | The stack listed "MMKV **/** WatermelonDB" as an either/or. WatermelonDB is a SQLite ORM plus a sync engine — a second source of truth to reconcile against TanStack Query's cache. Persisting the Query cache to MMKV gives offline reads for ~15 lines and zero reconciliation. Still inside the stated stack. |
| 2 | **Client-generated UUIDs.** | The original schema had `default uuid_generate_v4()` server-side. An offline client cannot reference a row whose ID does not exist yet — subtasks, edits, and undo all break. The client mints the UUID; this also makes INSERT retries idempotent (PK conflict = already synced). This is the single most important schema change for offline-first. |
| 3 | **Soft delete (`deleted_at`) everywhere.** | Solves three problems with one column — see §5.4. Notably, **Supabase does not apply RLS to `DELETE` events over Realtime, and delete events cannot be filtered.** Hard deletes broadcast row IDs to every subscriber on the channel. |
| 4 | **`updated_at` set by DB trigger, not by the client.** | The original schema declared `updated_at` with a default but nothing ever updated it. It was decorative. Conflict resolution depends on it, and a device with a wrong clock must not be able to win a write forever. |
| 5 | **Postgres `enum` instead of `text` + `check`.** | `supabase gen types typescript` emits a proper TS union for an enum and a bare `string` for a check-constrained text column. The stack's stated rationale for TypeScript is "end-to-end type safety with Supabase DB types" — enums are what actually deliver it. |
| 6 | **Added `habits` + `habit_entries`.** | The tagline promises a habit engine. The original schema had no habits table. |
| 7 | **Dropped the `uuid-ossp` extension.** | `gen_random_uuid()` is in core Postgres since 13. Supabase runs 15+. One less extension. |
| 8 | **Added indexes on every RLS predicate column.** | An RLS policy filtering on an unindexed `user_id` is a sequential scan per query. This is the most common Supabase performance failure. |
| 9 | **RLS policies use `(select auth.uid())` and split UPDATE into `USING` + `WITH CHECK`.** | The `select` wrapper lets Postgres cache the call as an initPlan instead of re-evaluating per row. Explicit `WITH CHECK` is required to stop a user reassigning a row's `user_id`. |
| 10 | **Streaks are computed, never stored.** | A stored `streak` column goes stale the moment an entry is backdated or synced late. Derived data is derived. |
| 11 | **SDK target updated.** | The concept said "SDK 51+, New Architecture enabled". SDK 51 shipped mid-2024. **Current is SDK 57** (July 2026), and **SDK 55 removed the Legacy Architecture entirely** — `newArchEnabled` is now a no-op. Target the current SDK. Stack unchanged; only the pin moved. |
| 12 | **Session stored in MMKV, encryption key in SecureStore.** | `expo-secure-store` has a ~2048-byte practical ceiling and a Supabase session with OAuth claims exceeds it. This bites everyone who follows the Expo quickstart with Google sign-in. MMKV is already in the stack — no new dependency. |
| 13 | **Added a `ai_usage` rate-limit table and a summary cache.** | An unmetered LLM endpoint behind a public JWT is a billing incident. This is a trust boundary, not a nice-to-have. |
| 14 | **Added §11, an explicit non-goals list.** | The features not built are as much a part of the design as the ones that are. |
| 15 | **`profiles.timezone` is now written at sign-in.** | It defaulted to `'UTC'` and nothing ever set it. §7.5's cron keys off it, so every user would have received their "daily" summary at 21:00 UTC. |
| 16 | **Session is refreshed *before* paused mutations replay.** | A device offline long enough for the refresh token to expire would replay its queue into a 401, exhaust retries, and drop the writes. Silent data loss, directly contradicting constraint #1. |
| 17 | **Sync merge logic extracted into pure functions with tests (§5.7).** | The realtime reducer was an inline closure — the highest-risk logic in the app and the only part that could corrupt data silently, with no way to test it off-device. |
| 18 | **Project layout moved to `src/` per official Expo convention (§8).** | `create-expo-app` scaffolds `src/` with `@/*` aliased. Matching it costs nothing and avoids fighting the template. |
| 19 | **Added sync-state UX (§5.8).** | The data model was correct but the app had no way to tell the user a write was still queued, or that sync had failed. Offline-first apps fail on this more often than on sync bugs. |
| 20 | **`touch_updated_at` fires on INSERT as well as UPDATE.** | Found during Phase 2. UPDATE-only left `updated_at` merely defaulted on insert, so a crafted POST could set it to a future date and win every LWW merge permanently. Migration `0003`. |

---

## 1. Overview

**Orbit** is a cross-platform app for tracking tasks, habits, and a daily log. Every write lands in local storage first and renders immediately; sync to Postgres happens behind the UI. Changes propagate to the user's other devices over a websocket. Two AI features run server-side in Edge Functions so no API key ever touches the client.

### Design constraints, in priority order

1. **A write must never be lost.** Airplane mode, force-quit, dead battery mid-sync — the mutation survives and replays.
2. **The UI must never wait on the network.** No spinner on a task toggle. Ever.
3. **The client is never trusted.** Every access rule is enforced in Postgres, not in the app.
4. **One source of truth on the client.** The TanStack Query cache. Zustand holds no server data.

### Non-goals

See §11. Read it before adding anything.

---

## 2. Tech stack

Locked. The "decision within" column is where the remaining choices were made.

| Component | Technology | Decision within |
|---|---|---|
| Framework | **Expo (React Native)** | Target current SDK (57 as of Aug 2026). New Architecture is mandatory from SDK 55 — no flag to set. |
| Language | **TypeScript** | `strict: true` + `noUncheckedIndexedAccess`. DB types generated, never hand-written. |
| Navigation | **Expo Router** | File-based. Two route groups: `(auth)` and `(app)`. Auth gating via a redirect in `(app)/_layout.tsx`, not per-screen guards. |
| State & sync | **TanStack Query + Zustand** | Query owns **all** server state and is the offline store. Zustand owns UI-only state (active filter, sheet open). If a value came from Postgres, it does not go in Zustand. |
| Backend & DB | **Supabase** | Postgres 15+, RLS on every table, Realtime `postgres_changes`, Auth with three providers. |
| Edge compute | **Supabase Edge Functions** | Deno. Caller's JWT forwarded so RLS still applies inside the function. `service_role` is not used. |
| Local storage | **MMKV** | Three instances: query cache, session, sync metadata. WatermelonDB dropped (§0.1). |
| Styling | **NativeWind (Tailwind)** | **v4.2.6 + Tailwind 3.4.19, both stable.** Not v5: it is still `5.0.0-preview.4`, and v4.2.6 was published *later* (2026-06-22 vs 2026-05-15) — the stable line is the maintained one. v5 also requires a `src/tw/` module wrapping every RN component in `useCssElement`, versus v4's babel preset giving `className` directly. Revisit when v5 goes stable. |

### Dependencies beyond the stack

Deliberately short. Each line justifies itself.

```
@tanstack/react-query                      # server state
@tanstack/react-query-persist-client       # offline cache + paused mutation replay
react-native-mmkv                          # storage engine
zustand                                    # UI state
@supabase/supabase-js                      # client
expo-network                               # connectivity → onlineManager (Expo built-in, no NetInfo)
expo-secure-store                          # holds ONE 32-byte key
expo-crypto                                # generates that key + client-side UUIDs
expo-auth-session / expo-apple-authentication   # OAuth providers
nativewind + tailwindcss
```

No form library (three text inputs), no date library (`Intl.DateTimeFormat` is native and locale-aware), no state machine library, no navigation library beyond Router, no HTTP client (supabase-js wraps `fetch`).

---

## 3. Architecture

The important thing this diagram says: **the Query cache is the offline database.** There is no second store to reconcile.

```text
┌──────────────────────────────────────────────────────────────────────┐
│                        Expo Client                                   │
│                                                                      │
│   Screens (Expo Router)  ──►  NativeWind components                  │
│          │                                                           │
│          ├──► Zustand ....................... UI state only          │
│          │                                                           │
│          └──► TanStack Query Cache  ◄══════════════╗                 │
│                    │        ▲                      ║                 │
│         optimistic │        │ realtime patch       ║ persist/rehydrate│
│           onMutate │        │ (guarded, §5.3)      ║ (sync, MMKV)    │
│                    ▼        │                      ▼                 │
│              Mutation Queue (persisted, replays on reconnect)        │
│                    │                                                 │
│              onlineManager ◄── expo-network listener                 │
└────────────────────┬─────────────────────────────────────────────────┘
                     │ HTTPS (PostgREST)  +  WSS (Realtime)
                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Supabase                                     │
│                                                                      │
│   Auth ──issues JWT──►  PostgREST ──►  Postgres  ◄── RLS (per JWT)   │
│                                           │                          │
│                                    WAL ──►│──► Realtime Engine ──► WSS│
│                                           │    (RLS-checked per sub) │
│                                           │                          │
│   Edge Functions ──(caller's JWT, RLS applies)──┘                    │
│         │                                                            │
│         └──(server-side secret)──► External AI API                   │
└──────────────────────────────────────────────────────────────────────┘
```

### Write path, end to end

1. User taps "complete". `onMutate` fires.
2. Cache patched, screen re-renders. **Elapsed: one frame.**
3. Cache written to MMKV synchronously. Survives a force-quit from here on.
4. If online → PATCH to PostgREST. If offline → mutation is paused and persisted.
5. Server trigger stamps `updated_at`. WAL → Realtime → other devices.
6. `onSuccess` writes the canonical server row into the cache.
7. On reconnect, paused mutations replay in order, then a delta pull runs (§5.5).

---

## 4. Data model

Complete and runnable. Apply as one migration.

### 4.1 Types

```sql
-- gen_random_uuid() is core Postgres 13+. No extension needed.

create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.habit_cadence  as enum ('daily', 'weekly');
```

### 4.2 Shared trigger functions

Both live in a non-exposed schema. A `security definer` function in `public` is granted `EXECUTE` to `PUBLIC` by default, which makes it a callable API endpoint for every signed-in user.

```sql
create schema if not exists private;

-- updated_at is server-authoritative. Never accept it from the client:
-- conflict resolution reads it, and a device with a skewed clock would
-- otherwise be able to win every write permanently.
--
-- The trigger must fire on INSERT as well as UPDATE. An UPDATE-only trigger
-- leaves the column merely defaulted on insert, so a client posting straight
-- to PostgREST can set updated_at = '2099-01-01' — and that row then wins
-- every LWW merge forever and matches every delta-pull cursor. A narrow
-- client-side input type does not close this; the database is the boundary.
create function private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.handle_new_user()
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
```

> `raw_user_meta_data` is user-editable. It is fine as a display-name seed. It must **never** appear in an authorization check.

### 4.3 Tables

```sql
-- ── profiles ────────────────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  avatar_url  text,
  -- Written at sign-in from Intl.DateTimeFormat().resolvedOptions().timeZone.
  -- The default is a fallback, NOT the expected value: §7.5's cron reads this
  -- to decide when the user's day ends. Left at 'UTC' it silently delivers
  -- every user's "daily" summary at 21:00 UTC.
  timezone    text not null default 'UTC',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger touch_profiles before insert or update on public.profiles
  for each row execute function private.touch_updated_at();


-- ── tasks ───────────────────────────────────────────────────────────
create table public.tasks (
  -- Client mints this UUID before the row ever reaches the server.
  -- The default only covers server-side inserts (Edge Functions).
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,

  title         text not null check (length(trim(title)) between 1 and 500),
  description   text check (length(description) <= 10000),
  priority      public.task_priority not null default 'medium',
  tags          text[] not null default '{}',
  estimated_min integer check (estimated_min is null or estimated_min between 1 and 10080),

  due_date      timestamptz,
  completed_at  timestamptz,          -- null = open. Replaces is_completed:
                                      -- carries "when", which the AI summary needs.

  parent_id     uuid references public.tasks(id) on delete cascade,  -- AI decomposition

  deleted_at    timestamptz,          -- soft delete, see §5.4
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger touch_tasks before insert or update on public.tasks
  for each row execute function private.touch_updated_at();


-- ── habits ──────────────────────────────────────────────────────────
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

  -- Enables the composite FK on habit_entries below.
  unique (id, user_id)
);

create trigger touch_habits before insert or update on public.habits
  for each row execute function private.touch_updated_at();


-- ── habit_entries ───────────────────────────────────────────────────
create table public.habit_entries (
  id         uuid primary key default gen_random_uuid(),
  habit_id   uuid not null,

  -- Denormalized so RLS is an indexed comparison instead of a subquery
  -- against habits on every row. The composite FK below makes the DB
  -- guarantee it always matches the parent — no trigger, no app code.
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

create trigger touch_habit_entries before insert or update on public.habit_entries
  for each row execute function private.touch_updated_at();


-- ── daily_summaries ─────────────────────────────────────────────────
-- Doubles as the AI summary cache and the user's "daily context" note.
create table public.daily_summaries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  summary_date date not null,

  user_note    text check (length(user_note) <= 5000),   -- written by the user
  ai_summary   text,                                     -- written by the Edge Function
  ai_model     text,
  generated_at timestamptz,

  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- The cache key. A second request for the same day costs nothing.
  unique (user_id, summary_date)
);

create trigger touch_daily_summaries before insert or update on public.daily_summaries
  for each row execute function private.touch_updated_at();


-- ── ai_usage ────────────────────────────────────────────────────────
-- Rate limiting is a trust boundary, not an optimization.
-- Client has no policy on this table; only the Edge Function writes it.
create table public.ai_usage (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null default current_date,
  calls      integer not null default 0,
  primary key (user_id, usage_date)
);
```

### 4.4 Indexes

Every RLS predicate column and every hot query path.

```sql
-- Primary list query: user's live tasks, newest first.
create index tasks_user_live_idx
  on public.tasks (user_id, created_at desc)
  where deleted_at is null;

-- Delta sync pull (§5.5) — must include tombstones, so no partial predicate.
create index tasks_user_updated_idx   on public.tasks          (user_id, updated_at);
create index habits_user_updated_idx  on public.habits         (user_id, updated_at);
create index entries_user_updated_idx on public.habit_entries  (user_id, updated_at);

-- Agenda screen.
create index tasks_user_due_idx
  on public.tasks (user_id, due_date)
  where deleted_at is null and completed_at is null;

-- Subtask lookup for AI decomposition.
create index tasks_parent_idx on public.tasks (parent_id) where parent_id is not null;

-- Habit grid + streak computation.
create index entries_habit_date_idx on public.habit_entries (habit_id, entry_date desc);

-- Tag filter.
create index tasks_tags_idx on public.tasks using gin (tags);
```

### 4.5 Row Level Security

```sql
alter table public.profiles        enable row level security;
alter table public.tasks           enable row level security;
alter table public.habits          enable row level security;
alter table public.habit_entries   enable row level security;
alter table public.daily_summaries enable row level security;
alter table public.ai_usage        enable row level security;
-- ai_usage gets RLS enabled but NO policies: default-deny.
-- Only the Edge Function's elevated path may touch it.

-- profiles
create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using       ((select auth.uid()) = id)
  with check  ((select auth.uid()) = id);
-- No INSERT policy: rows are created by the auth trigger.
-- No DELETE policy: account deletion cascades from auth.users.
```

The same four-policy shape repeats for each owned table. Written out once for `tasks`; apply verbatim to `habits`, `habit_entries`, and `daily_summaries`.

```sql
create policy "tasks: select own" on public.tasks
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "tasks: insert own" on public.tasks
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "tasks: update own" on public.tasks
  for update to authenticated
  using      ((select auth.uid()) = user_id)   -- which rows I may target
  with check ((select auth.uid()) = user_id);  -- what I may leave behind

create policy "tasks: delete own" on public.tasks
  for delete to authenticated
  using ((select auth.uid()) = user_id);
```

Four things this shape gets right that `for all using (auth.uid() = user_id)` does not:

- **`(select auth.uid())`** is evaluated once as an initPlan, not once per row.
- **Explicit `WITH CHECK` on UPDATE** blocks reassigning `user_id` to another user.
- **`TO authenticated`** scopes the policy to the role. `auth.role() = 'authenticated'` is deprecated *and* silently passes for anonymous sign-ins.
- **Split by command** so the DELETE policy can later be revoked independently — the app soft-deletes, and hard DELETE only needs to exist for the purge job.

> Note: an UPDATE in Postgres must first SELECT the row. A missing SELECT policy makes updates return zero rows with **no error**. Every table above has one.

### 4.6 Data API exposure

Newly created tables are not always auto-exposed. Grant explicitly, and never grant `ai_usage`.

```sql
grant select, insert, update, delete
  on public.tasks, public.habits, public.habit_entries, public.daily_summaries
  to authenticated;

grant select, update on public.profiles to authenticated;
-- ai_usage: no grant. Not reachable from the client at all.
```

### 4.7 Realtime publication

```sql
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.habits;
alter publication supabase_realtime add table public.habit_entries;

-- Needed so UPDATE payloads carry the old row (used to detect the
-- null → not-null transition on deleted_at).
alter table public.tasks          replica identity full;
alter table public.habits         replica identity full;
alter table public.habit_entries  replica identity full;
```

`daily_summaries` is deliberately excluded — AI summaries are pulled on demand and do not need a live channel.

### 4.8 Streaks: a view, not a column

```sql
create view public.habit_streaks
with (security_invoker = true)   -- REQUIRED. Views bypass RLS by default.
as
select
  h.id as habit_id,
  h.user_id,
  count(*) filter (
    where e.entry_date > current_date - (
      select coalesce(min(gap.d), 10000)
      from generate_series(1, 365) as gap(d)
      where not exists (
        select 1 from public.habit_entries x
        where x.habit_id = h.id
          and x.deleted_at is null
          and x.entry_date = current_date - gap.d
      )
    )
  ) as current_streak
from public.habits h
left join public.habit_entries e
  on e.habit_id = h.id and e.deleted_at is null
where h.deleted_at is null
group by h.id, h.user_id;
```

<!-- ponytail: O(365) scan per habit. Fine to a few hundred habits/user.
     If the habits screen ever gets slow, materialize per-habit on write. -->

> `security_invoker = true` is not optional. A view without it runs as its owner and returns **every user's rows**. This is the most common way an otherwise-correct RLS setup leaks.

---

## 5. The sync engine

The hard part. Everything else is CRUD.

### 5.1 Query cache as the offline store

```ts
// lib/query.ts
import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { MMKV } from 'react-native-mmkv';

const cacheStore = new MMKV({ id: 'orbit-query-cache' });

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: Infinity,           // never evict — this IS the offline DB
      staleTime: 30_000,
      retry: 2,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst', // pause instead of fail when offline
      retry: 3,
    },
  },
});

persistQueryClient({
  queryClient,
  persister: {
    persistClient: (c) => cacheStore.set('cache', JSON.stringify(c)),
    restoreClient: () => {
      const raw = cacheStore.getString('cache');
      return raw ? JSON.parse(raw) : undefined;
    },
    removeClient: () => cacheStore.delete('cache'),
  },
  maxAge: Infinity,
});

// Connectivity. expo-network is already in the Expo runtime — no NetInfo.
Network.addNetworkStateListener(({ isInternetReachable }) => {
  onlineManager.setOnline(isInternetReachable ?? false);
});
```

Paused mutations only survive a restart if their `mutationFn` can be rebuilt from the persisted key. Register defaults at module scope:

```ts
queryClient.setMutationDefaults(['tasks', 'upsert'], { mutationFn: upsertTask });
queryClient.setMutationDefaults(['tasks', 'delete'], { mutationFn: softDeleteTask });
// ...then call queryClient.resumePausedMutations() once after hydration.
```

Mutations declared with an inline `mutationFn` and no registered default are **silently dropped on restart**. This is the number one way an "offline-first" app loses writes.

### 5.2 Optimistic mutations

```ts
// hooks/use-tasks.ts
export function useUpsertTask() {
  return useMutation({
    mutationKey: ['tasks', 'upsert'],
    mutationFn: upsertTask,

    onMutate: async (draft: TaskDraft) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const previous = queryClient.getQueryData<Task[]>(['tasks']);

      queryClient.setQueryData<Task[]>(['tasks'], (old = []) => {
        const existing = old.find((t) => t.id === draft.id);
        // updated_at here is a local placeholder. The server trigger
        // sets the authoritative value; onSuccess overwrites it.
        const next = { ...existing, ...draft, updated_at: new Date().toISOString() } as Task;
        return existing
          ? old.map((t) => (t.id === draft.id ? next : t))
          : [next, ...old];
      });

      return { previous };
    },

    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['tasks'], ctx.previous);
    },

    onSuccess: (serverRow) => {
      // Write the canonical row: real updated_at, any DB-computed fields.
      queryClient.setQueryData<Task[]>(['tasks'], (old = []) =>
        old.map((t) => (t.id === serverRow.id ? serverRow : t)),
      );
    },
  });
}
```

The client always sends a UUID it generated:

```ts
import * as Crypto from 'expo-crypto';
const draft = { id: Crypto.randomUUID(), title, user_id: session.user.id };
```

Server-side this is an idempotent upsert, so a replayed mutation after a flaky connection is harmless:

```ts
const upsertTask = (draft: TaskDraft) =>
  supabase.from('tasks').upsert(draft).select().single().then(unwrap);
```

### 5.3 Realtime, and the echo problem

Your own writes come back to you over the channel. Applying them blindly clobbers a newer local edit that hasn't synced yet.

**Rule: a row with a pending local mutation is never patched from Realtime.** The pending mutation's `onSuccess` will write the canonical row a moment later.

The merge itself is a **pure function**, kept out of the hook. It is the only logic in Orbit that can silently corrupt data, and inside a closure it cannot be tested without a device and two network connections. Tests in §5.7.

```ts
// src/lib/sync-merge.ts
export type Syncable = { id: string; updated_at: string; deleted_at: string | null };

/** Apply one realtime row. Pure: no cache, no network, no clock. */
export function applyRealtimeRow<T extends Syncable>(
  current: T[],
  row: T,
  isPending: (id: string) => boolean,
): T[] {
  if (isPending(row.id)) return current;          // local edit wins; onSuccess follows
  if (row.deleted_at) return current.filter((t) => t.id !== row.id);

  const existing = current.find((t) => t.id === row.id);
  if (!existing) return [row, ...current];

  // Last-write-wins on the server-authoritative timestamp (§5.6).
  // map(), not Array.prototype.with() — see the Hermes note below.
  return row.updated_at > existing.updated_at
    ? current.map((t) => (t.id === row.id ? row : t))
    : current;
}

/** Merge a delta-pull batch. Idempotent — re-delivering a row is a no-op. */
export function mergeById<T extends Syncable>(current: T[], incoming: T[]): T[] {
  return incoming.reduce((acc, row) => applyRealtimeRow(acc, row, () => false), current);
}
```

The hook shrinks to wiring:

```ts
// src/hooks/use-realtime.ts
const isPending = (id: string) =>
  queryClient.getMutationCache().getAll()
    .some((m) => m.state.status === 'pending' && (m.state.variables as any)?.id === id);

useEffect(() => {
  if (!session) return;
  const channel = supabase
    .channel('orbit-tasks')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${session.user.id}` },
      ({ new: row }) => {
        if (!row?.id) return;
        queryClient.setQueryData<Task[]>(['tasks'], (old = []) =>
          applyRealtimeRow(old, row as Task, isPending),
        );
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [session?.user.id]);
```

Notes:

- The handler **patches the cache directly** rather than calling `invalidateQueries`. The payload already contains the row; a refetch is a wasted round trip and can land stale over optimistic state.
- The `filter` is server-side. Without it every row change on the table is evaluated per subscriber.
- Realtime throughput scales with **subscriber count**, not write rate, because authorization is checked per subscriber. Past ~3k concurrent subscribers on one table, switch to Broadcast. Not a concern at Orbit's scale.
- Confirm the socket carries the current JWT after sign-in and token refresh (`supabase.realtime.setAuth(...)` in older client versions). An unauthenticated socket receives nothing and fails **silently**.

### 5.4 Soft delete

One column, three problems:

1. **Realtime leak.** RLS is not applied to `DELETE` events, and delete events cannot be filtered. A hard delete pushes the row ID to every subscriber on that table. Setting `deleted_at` emits an **UPDATE** — RLS-checked, filterable.
2. **Offline resurrection.** Device A deletes a task offline. Device B syncs and pushes the row back down. With a tombstone, B's copy carries `deleted_at` and stays dead.
3. **Delta sync.** A hard-deleted row is invisible to a `updated_at > last_sync` pull — the client would never learn it's gone. A tombstone bumps `updated_at` and shows up like any other change.

Every read filters it:

```ts
supabase.from('tasks').select('*').is('deleted_at', null);
```

Purge on a schedule so tombstones don't accumulate forever:

```sql
select cron.schedule(
  'purge-tombstones', '0 4 * * *',
  $$ delete from public.tasks
       where deleted_at is not null
         and deleted_at < now() - interval '30 days' $$
);
```

<!-- ponytail: 30 days assumes no device stays offline longer than that.
     A device offline for 31+ days resurrects the row. Acceptable; if it
     ever matters, gate the purge on min(last_sync_at) across the user's devices. -->

### 5.5 Delta pull on reconnect

Refetching everything on every reconnect defeats the point. Pull only what changed.

```ts
const meta = new MMKV({ id: 'orbit-sync' });

async function deltaPull(userId: string) {
  const since = meta.getString('last_sync_at') ?? '1970-01-01T00:00:00Z';

  // 5-minute overlap: a transaction can commit after a later-timestamped
  // one, so a strict > cursor can skip rows. Re-pulling is free because
  // the cache merge is an idempotent upsert keyed on id.
  const cursor = new Date(Date.parse(since) - 5 * 60_000).toISOString();

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .gt('updated_at', cursor)     // includes tombstones — that's the point
    .order('updated_at');
  if (error) throw error;

  queryClient.setQueryData<Task[]>(['tasks'], (old = []) => mergeById(old, data));
  meta.set('last_sync_at', new Date().toISOString());
}
```

Order on reconnect matters, and there are **three** steps, not two:

```ts
// src/hooks/use-sync.ts
async function onReconnect() {
  // 1. Refresh FIRST. A device offline long enough for the refresh token to
  //    expire would otherwise replay its whole queue into 401s, exhaust the
  //    3 retries, and drop every write — silent data loss, and a direct
  //    violation of constraint #1. Mutations must never be the thing that
  //    discovers the session is dead.
  const { error } = await supabase.auth.refreshSession();
  if (error) {
    // Do NOT resume. Leave the queue paused and intact, and send the user
    // to sign-in. The mutations survive in MMKV and replay after re-auth.
    setSyncState({ kind: 'auth-required' });
    return;
  }

  // 2. Push local work before pulling, or a stale server row lands on top
  //    of a local edit that hasn't been sent yet.
  await queryClient.resumePausedMutations();

  // 3. Then reconcile.
  await deltaPull(session.user.id);
}
```

Retry policy must treat 401 as non-retryable so a dead session never burns the retry budget:

```ts
mutations: {
  networkMode: 'offlineFirst',
  retry: (count, err) => (err as ApiError)?.status === 401 ? false : count < 3,
}
```

### 5.6 Conflict resolution

**Last write wins, whole row, on server `updated_at`.**

Stated plainly so it can be judged: if two devices edit *different fields* of the same task while both offline, the device that syncs second wins entirely and the other's field change is lost.

<!-- ponytail: whole-row LWW. Correct for a single-user multi-device app,
     where genuine concurrent edits are rare. Upgrade path if it ever bites:
     per-field timestamps, or a CRDT. Not before there is a complaint. -->

This is the right trade here. A merge engine is weeks of work and a permanent source of subtle bugs, for a scenario one user hits roughly never.

### 5.7 Tests for the merge logic

One file. It covers the only code path that can lose a user's work without anything visibly failing.

`applyRealtimeRow` and `mergeById` import nothing from React Native, so they run under `node --test` with no simulator, no jest-expo preset, and no config beyond `tsx`. Colocated next to the source per Expo convention.

```ts
// src/lib/sync-merge.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRealtimeRow, mergeById } from './sync-merge';

const row = (id: string, updated_at: string, deleted_at: string | null = null) =>
  ({ id, updated_at, deleted_at });
const never = () => false;

test('older echo does not clobber a newer local row', () => {
  const local = [row('a', '2026-08-01T10:00:05Z')];
  const echo  = row('a', '2026-08-01T10:00:00Z');
  assert.deepEqual(applyRealtimeRow(local, echo, never), local);
});

test('newer server row wins', () => {
  const local = [row('a', '2026-08-01T10:00:00Z')];
  const fresh = row('a', '2026-08-01T10:00:05Z');
  assert.equal(applyRealtimeRow(local, fresh, never)[0]!.updated_at, '2026-08-01T10:00:05Z');
});

test('a row with a pending mutation is never patched', () => {
  const local = [row('a', '2026-08-01T10:00:00Z')];
  const fresh = row('a', '2026-09-01T00:00:00Z');   // much newer — still ignored
  assert.deepEqual(applyRealtimeRow(local, fresh, (id) => id === 'a'), local);
});

test('tombstone removes the row', () => {
  const local = [row('a', '2026-08-01T10:00:00Z'), row('b', '2026-08-01T10:00:00Z')];
  const dead  = row('a', '2026-08-01T10:00:01Z', '2026-08-01T10:00:01Z');
  assert.deepEqual(applyRealtimeRow(local, dead, never).map((t) => t.id), ['b']);
});

test('unknown row is inserted', () => {
  assert.equal(applyRealtimeRow([], row('a', '2026-08-01T10:00:00Z'), never).length, 1);
});

test('delta pull is idempotent — the 5-minute overlap is safe', () => {
  const batch = [row('a', '2026-08-01T10:00:00Z'), row('b', '2026-08-01T10:00:01Z')];
  const once  = mergeById([], batch);
  assert.deepEqual(mergeById(once, batch), once);
});
```

```bash
node --test src/lib/*.test.ts     # Node >= 22.18 strips types natively; no ts-jest, no babel
```

<!-- ponytail: node:test over jest-expo because these functions touch no RN
     surface. If component tests ever get written, switch to jest-expo then —
     not before. -->

> **Hermes runs ES6, not whatever your Node runs.** Hermes officially targets
> ECMAScript 2015 plus a specific list of later additions; anything post-ES6 not
> on that list is excluded. `Array.prototype.with()`, `toSorted()`, `toSpliced()`,
> and `Object.groupBy()` are the ones that catch people — they are natural fits
> for immutable cache updates, they work in every Node test and in Chrome
> debugging, and they throw `undefined is not a function` on device.
>
> This is exactly the gap these tests do **not** close: green in Node, crash in
> the app. `applyRealtimeRow` uses `find` + `map` for that reason. Anything in
> `src/lib/` that is unit-tested off-device must stay inside what Hermes runs,
> or be verified on a real build.

<!-- ponytail: no eslint-plugin-es-compat configured. If post-ES6 methods keep
     sneaking in, add it — one rule beats remembering. -->

### 5.8 Sync state, as the user sees it

Correct sync that the user cannot observe is indistinguishable from broken sync. Three states, one component, no per-row spinners.

```ts
type SyncState =
  | { kind: 'synced' }
  | { kind: 'offline'; queued: number }        // expected; reassure, don't alarm
  | { kind: 'auth-required' }                  // queue intact, needs re-login
  | { kind: 'failed'; queued: number };        // exhausted retries; needs a human
```

```ts
// src/hooks/use-sync-state.ts — derived, never stored
const mutations = useMutationState({ filters: { status: 'paused' } });
const failed    = useMutationState({ filters: { status: 'error' } });
```

Rules, in order of how often they get this wrong:

- **Never show a per-row spinner while online.** A round trip is tens of milliseconds; a spinner that flashes and vanishes reads as instability and breaks constraint #2. Show per-row pending state *only* when offline, or when one mutation has been pending past ~5s.
- **The offline banner is reassurance, not an error.** "Offline — 3 changes saved locally" in a neutral color. The writes are safe; saying so is the whole point of building it this way.
- **`failed` must be loud and actionable.** This is the one state that means work is genuinely at risk. Persistent banner, a Retry button calling `resumePausedMutations()`, and a way to see which items. A failure that only appears in a log is the same as data loss.
- **`auth-required` must not look like a crash.** The queue is intact in MMKV. Say "Sign in to sync 3 changes" and route to sign-in — do not clear the cache, and do not sign out (that would call `queryClient.clear()` and destroy the queue, per §6.3).
- **Conflicts are silent, deliberately.** LWW discards the losing edit with no notification. Surfacing it would require diffing both versions and building a resolution UI — see §5.6 and the ceiling in §10. This is an accepted behavior, not an oversight; it is written down here so it stays a decision.

Sign-out while writes are queued needs a confirmation, since §6.3 clears the cache:

```ts
if (queuedCount > 0) {
  // "You have 3 unsaved changes. Signing out will discard them."
}
```

---

## 6. Auth

### 6.1 Session storage

The Expo quickstart's `SecureStore` adapter breaks the moment a Google session carries enough claims — SecureStore tops out near 2048 bytes and Supabase sessions exceed it. The failure is a silent write error, then a logout on next launch.

Fix: MMKV holds the session, encrypted with a 32-byte key that lives in SecureStore. MMKV is already a dependency.

> **This is not the "tokens in AsyncStorage" anti-pattern — do not "fix" it back.**
> Standard Expo guidance is *store tokens in SecureStore, never in AsyncStorage*, and that guidance is right: AsyncStorage is plaintext on disk. This design satisfies it. MMKV holds **ciphertext**, and the only secret — a 44-byte key — is in the platform keychain, comfortably under the size limit that breaks the naive approach. Swapping this for a plain `SecureStore` adapter reintroduces the silent-logout bug the moment a Google session carries enough claims.

Three details here are not guesses — each one was wrong on the first pass and
corrected against `react-native-mmkv@4.3.2`'s actual type definitions:

- **`createMMKV(...)`, not `new MMKV(...)`.** v4 moved to a factory; the `MMKV`
  export is now a *type only*, so the constructor form fails to compile.
- **`.remove(key)`, not `.delete(key)`.** Renamed in v4.
- **The encryption key caps at 16 bytes (AES-128) or 32 (AES-256).** A 32-byte
  random value base64'd is 44 characters — over the ceiling, so it throws at
  startup. And `Buffer` does not exist in React Native at all. A v4 UUID with
  its dashes stripped is exactly 32 hex characters, which is the AES-256 key
  length, with no encoding step.

```ts
// src/lib/storage.ts
import { createMMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const KEY_NAME = 'orbit-mmkv-key';

function loadOrCreateKey(): string {
  const existing = SecureStore.getItem(KEY_NAME);
  if (existing) return existing;
  const key = Crypto.randomUUID().replace(/-/g, '');   // exactly 32 chars
  SecureStore.setItem(KEY_NAME, key);
  return key;
}

export const sessionStore = createMMKV({
  id: 'orbit-session',
  encryptionKey: loadOrCreateKey(),
  encryptionType: 'AES-256',
});
```

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { sessionStore } from './storage';
import type { Database } from '@/types/supabase';

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      storage: {
        getItem: (k) => sessionStore.getString(k) ?? null,
        setItem: (k, v) => sessionStore.set(k, v),
        removeItem: (k) => { sessionStore.remove(k); },
      },
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,   // required on native
    },
  },
);

// React Native does not run timers reliably in the background. Without
// this the token silently expires and every request 401s after a while.
AppState.addEventListener('change', (state) => {
  state === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh();
});
```

Use the **publishable** key. The `service_role` key never appears in client code or in any `EXPO_PUBLIC_*` variable — that prefix ships the value into the bundle.

### 6.2 Route gating

One redirect, not a guard per screen.

```
src/app/
  _layout.tsx              # providers, session bootstrap, splash hold
  (auth)/
    _layout.tsx
    sign-in.tsx            # magic link + Google + Apple
  (app)/
    _layout.tsx            # <Redirect href="/sign-in" /> when no session
    (tabs)/
      _layout.tsx
      index.tsx            # Today
      tasks.tsx
      habits.tsx
      settings.tsx
    task/[id].tsx          # modal presentation
```

```tsx
// src/app/(app)/_layout.tsx
export default function AppLayout() {
  const { session, loading } = useAuth();
  if (loading) return null;                        // splash stays up
  if (!session) return <Redirect href="/sign-in" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

### 6.3 Providers

| Provider | Notes |
|---|---|
| Magic link | Lowest-friction path and the fallback when OAuth misbehaves. **Phase 1 uses the 6-digit code, not the emailed URL** — `signInWithOtp` sends both, and `verifyOtp` needs no deep-link scheme, no associated domains, and no URL handler. That config is what Google/Apple force anyway, so it is deferred with them (§10b). `signInWithOtp` also creates the user, so this is sign-up too. |
| Google | `expo-auth-session`. Separate client IDs for iOS / Android / web. Requires a dev build — not Expo Go. |
| Apple | `expo-apple-authentication` for the native sheet. **Mandatory** for App Store review if any other social login is present. |

On every `SIGNED_IN` event, write the device's timezone. Nothing else populates it, and §7.5's cron is useless without it:

```ts
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event !== 'SIGNED_IN' || !session) return;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;   // native Intl, no dep
  await supabase.from('profiles').update({ timezone: tz }).eq('id', session.user.id);
});
```

Sign-out must clear the local cache, or the next account on that device sees the previous user's tasks. **Check the queue first** — this is destructive to pending writes (§5.8):

```ts
async function signOut() {
  // Caller must have confirmed if queuedCount > 0. This throws away
  // unsynced mutations along with the cache.
  await supabase.auth.signOut();
  queryClient.clear();
  cacheStore.clearAll();
  meta.clearAll();
}
```

---

## 7. AI Edge Functions

Two functions. Both forward the caller's JWT so RLS still applies inside the function — no `service_role`, so a bug in the function cannot read another user's data.

### 7.1 Shared shape

```ts
// supabase/functions/_shared/client.ts
export function clientFor(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization) throw new Response('Unauthorized', { status: 401 });

  return createClient<Database>(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },  // RLS applies
  );
}
```

### 7.2 Rate limiting

Checked before any billable call. `ai_usage` has RLS enabled and zero policies, so the client cannot read or forge it.

```ts
// supabase/functions/_shared/limit.ts
const DAILY_LIMIT = 20;

export async function consumeQuota(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin.rpc('increment_ai_usage', { p_user_id: userId });
  if (error) throw error;
  if (data > DAILY_LIMIT) {
    throw new Response(JSON.stringify({ error: 'daily_limit_reached' }), { status: 429 });
  }
}
```

```sql
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
```

Atomic increment via `on conflict` — no read-then-write race between two concurrent requests.

### 7.3 `daily-summary`

Reads the day's completed tasks and habit entries, returns a short wrap-up, caches the result.

```ts
Deno.serve(async (req) => {
  const supabase = clientFor(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { date } = await req.json();

  // Cache hit → free. This is why daily_summaries has a unique key.
  const { data: cached } = await supabase
    .from('daily_summaries').select('ai_summary')
    .eq('summary_date', date).maybeSingle();
  if (cached?.ai_summary) return Response.json({ summary: cached.ai_summary, cached: true });

  await consumeQuota(admin, user.id);

  // RLS scopes these to the caller. No .eq('user_id', ...) needed — and
  // adding one would be a false sense of security anyway.
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
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,   // supabase secrets set
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      system: 'Summarize the day in 2-3 sentences. Direct, specific, no preamble. ' +
              'Name what got done. If nothing did, say so plainly without encouragement.',
      messages: [{ role: 'user', content: JSON.stringify({ tasks, entries }) }],
    }),
  });
  if (!res.ok) return new Response('AI provider error', { status: 502 });

  const summary = (await res.json()).content[0].text;

  await supabase.from('daily_summaries').upsert(
    { user_id: user.id, summary_date: date, ai_summary: summary,
      ai_model: 'claude-sonnet-5', generated_at: new Date().toISOString() },
    { onConflict: 'user_id,summary_date' },
  );

  return Response.json({ summary, cached: false });
});
```

> Verify the current model ID and pricing at build time rather than trusting this file. The provider is one URL and one header — swapping to OpenAI or Gemini is a localized change.

### 7.4 `decompose-task`

Takes a goal, returns atomic subtasks with time estimates. Insert them as `tasks` rows with `parent_id` set — no new table, the existing self-reference covers it.

Use the provider's structured-output / tool-calling mode rather than parsing prose. Then validate anyway:

```ts
const subtasks = parsed.subtasks
  .filter((s) => typeof s.title === 'string' && s.title.trim().length > 0)
  .slice(0, 12)                                    // cap regardless of what came back
  .map((s) => ({
    id: crypto.randomUUID(),
    user_id: user.id,
    parent_id: goalTaskId,
    title: s.title.trim().slice(0, 500),
    estimated_min: Number.isFinite(s.estimated_min)
      ? Math.min(Math.max(1, s.estimated_min), 480)
      : null,
  }));
```

Model output is untrusted input. It gets validated at the boundary like any other.

### 7.5 Scheduled summaries

```sql
select cron.schedule(
  'nightly-summaries', '0 * * * *',   -- hourly; the function filters by user timezone
  $$ select net.http_post(
       url     := 'https://<ref>.supabase.co/functions/v1/daily-summary-batch',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
         'Content-Type',  'application/json')
     ) $$
);
```

Runs hourly and picks up users whose local time just crossed 21:00 — that's what `profiles.timezone` is for.

<!-- ponytail: hourly poll instead of per-user scheduling. 24 no-op runs a day
     is cheaper to build and operate than per-user cron rows. Revisit only if
     the batch itself gets slow. -->

---

## 8. Project structure

Follows the official Expo layout: app code under `src/`, `@/*` aliased to `./src/*` (both are already wired by `create-expo-app`). Flat within that — a file gets created when there is a second caller, not in anticipation of one.

```
src/
  app/                    # ROUTES ONLY. Every file here is a route — see §6.2
  components/             # flat, kebab-case. No atoms/molecules/organisms.
    task-row.tsx
    habit-grid.tsx
    sync-banner.tsx       # §5.8
    empty-state.tsx
  hooks/
    use-auth.ts
    use-tasks.ts
    use-habits.ts
    use-realtime.ts
    use-sync.ts           # refresh → resume → deltaPull, in that order (§5.5)
    use-sync-state.ts     # derived sync state (§5.8)
  lib/
    supabase.ts           # client + encrypted session storage
    query.ts              # queryClient + persister + onlineManager
    storage.ts            # the three MMKV instances
    sync-merge.ts         # pure merge logic (§5.3)
    sync-merge.test.ts    # colocated, per Expo convention (§5.7)
    ai.ts                 # two typed wrappers over functions.invoke
  types/
    supabase.ts           # GENERATED. Never hand-edited.
supabase/
  migrations/
  functions/
    _shared/{client,limit}.ts
    daily-summary/index.ts
    daily-summary-batch/index.ts
    decompose-task/index.ts
app.json
eas.json
```

Deviations from the Expo skeleton, and why:

- **No `src/screens/`.** Expo's convention moves a screen body out of its route file once it grows past inline. Orbit's screens are a list and a grid; the folder gets created at the first screen that actually needs it, not now. This is the documented escape hatch — take it when a route file gets unwieldy, not before.
- **No `src/server/` or `app/api/`.** Those are for Expo API routes. Orbit's server code is Supabase Edge Functions, which live in `supabase/functions/`.
- **No `services/`, `repositories/`, `contexts/`, or `utils/index.ts`.** Hooks are the service layer; the Query cache is the repository.

Regenerate types after every migration — this is the load-bearing step for the whole TypeScript story:

```bash
supabase gen types typescript --project-id <ref> > src/types/supabase.ts
```

---

## 9. Build phases

Each phase ends with a check that fails loudly if the phase is broken.

### Phase 1 — Foundation

- `create-expo-app` with the tabs template, current SDK. Enable `strict` + `noUncheckedIndexedAccess`.
- Apply the §4 migration. Generate types.
- Supabase client with the MMKV session store (§6.1). Magic link only.
- Route groups and the redirect gate.
- `onAuthStateChange` writes `profiles.timezone` (§6.3). Easy to forget; §7.5 is broken without it.

**Check:** sign in, force-quit, reopen → still signed in. Then run the RLS proof:

```sql
-- As user A's JWT. Must return 0 rows, not an error.
set request.jwt.claims = '{"sub":"<user-a-uuid>","role":"authenticated"}';
set role authenticated;
select count(*) from public.tasks where user_id = '<user-b-uuid>';
```

Add Google and Apple only after magic link works end to end. Debugging OAuth redirects and session persistence at the same time is how a day disappears.

### Phase 2 — Tasks, offline-first

- `queryClient` + MMKV persister + `onlineManager` (§5.1).
- `useUpsertTask` / `useSoftDeleteTask` with `setMutationDefaults` registered (§5.2).
- `src/lib/sync-merge.ts` + its test file (§5.3, §5.7). **Write these before the UI** — they are pure functions with no dependencies, and getting them right first means the rest of the phase is wiring.
- Task list, detail modal, priority + tags + due date.
- `useSync`: refresh → resume → delta pull (§5.5). `SyncBanner` (§5.8).

**Check 1 — automated, runs in CI:**

```bash
node --test --experimental-strip-types src/lib/*.test.ts
```

**Check 2 — the acceptance test for the whole product:**

1. Airplane mode on.
2. Create three tasks, edit one, delete one.
3. Force-quit the app. Reopen. All four changes still there, banner reads "4 changes saved locally".
4. Airplane mode off.
5. All four land in Postgres, in order, with no duplicates. Banner clears.

If step 3 fails, `setMutationDefaults` is missing. If step 5 duplicates, the client isn't minting UUIDs.

**Check 3 — sync mechanics at the DB level.** Runnable without a device, and it
is what caught the INSERT-trigger gap above. Plant a bogus `updated_at` on both
the insert and the update path and assert the server overwrites it; replay an
insert and assert one row; soft-delete and assert the tombstone reaches a delta
pull but not the live list.

> `now()` is transaction-scoped, so every write inside one transaction shares an
> `updated_at`. Correct in production — each PostgREST request is its own
> transaction — but it means "did the timestamp advance?" can never pass inside
> a single `DO` block. Assert a planted value was *overwritten* instead.

**Check 4 — the expired-session path**, the one that silently loses data:

1. Airplane mode on. Make two edits.
2. In the Supabase dashboard, revoke the user's sessions.
3. Airplane mode off.
4. The app must show `auth-required` with the queue **intact** — not an empty list, not a crash, not two dropped writes. Sign back in; both edits land.

If the edits vanish here, either the 401 retry guard (§5.5) or the refresh-before-resume ordering is wrong.

### Phase 3 — Realtime + habits

- Channel subscription with the pending-mutation guard (§5.3).
- Habits, entry grid, streak view.

**Check:** two devices, same account. Toggle a task on A → appears on B in under a second. Then the echo test: go offline on A, edit a task, come back online — A's edit survives and is not overwritten by its own echo.

### Phase 4 — AI + ship

- Both Edge Functions with rate limiting and summary caching.
- pg_cron schedule.
- EAS build profiles; TestFlight + Play internal track.

**Check:** call `daily-summary` 21 times → the 21st returns 429. Call it twice for the same date → the second returns `cached: true` and bills nothing.

```bash
supabase secrets set ANTHROPIC_API_KEY=...
supabase functions deploy daily-summary
eas build --profile preview --platform all
```

Before every deploy:

```bash
supabase db advisors    # or MCP get_advisors
```

It catches missing RLS, unindexed policy columns, and `security_invoker`-less views. Run it, don't skip it.

---

## 10. Known ceilings

Every deliberate simplification, with the condition that would justify replacing it. These are tracked in-code as `ponytail:` comments.

| Ceiling | Breaks when | Upgrade |
|---|---|---|
| Whole-row LWW conflicts | Two devices edit different fields of one task, both offline | Per-field timestamps, or a CRDT |
| 30-day tombstone purge | A device is offline 31+ days | Gate the purge on the oldest `last_sync_at` |
| Streak view scans 365 days/habit | Hundreds of habits per user | Materialize per-habit on write |
| Whole query cache serialized to one MMKV key | Thousands of tasks make each write slow | Per-query keys, or WatermelonDB after all |
| 5-minute delta-pull overlap | Clock skew or transaction latency exceeds 5 min | Logical replication cursor instead of a timestamp |
| Hourly cron for daily summaries | Users need minute-accurate delivery | Per-user scheduled jobs |
| Fixed 20 calls/user/day | Real usage patterns emerge | Token-bucket, or tiering |

---

## 10b. Deferred — wanted, not yet scheduled

Distinct from §11. These are things that *should* exist eventually; they were consciously cut from the initial build to keep Phase 1–4 shippable. Reviewed at the end of Phase 4.

| Item | Why it was cut | Add before |
|---|---|---|
| **Accessibility baseline** | Not cut on merit — cut on sequencing. Touch targets ≥44pt, screen-reader labels on the task toggle and habit grid, dynamic type, contrast on the four priority colors. | **Any public release.** This is the one on this list that is a shipping blocker, not a nice-to-have. Retrofitting a11y is far more expensive than building with it. |
| **RLS policy tests in SQL** | §9's `set role authenticated` check covers it manually for Phase 1. | The second table gains a non-trivial policy, or the first time a policy is edited rather than written. |
| **Component / screen tests** | Slowest to write, most brittle, and §5.7 already covers the logic that can lose data. Would also mean adopting jest-expo. | The UI stops being two screens, or a rendering bug ships twice. |
| **Dev environment + migration loop** | Phase 1 applies one migration to one hosted project. The loop only starts mattering when migrations accumulate. | The second migration. Covers local `supabase start`, branching, seed data, rollback. |
| **`app.json` / deep-linking spec** | Magic link works with the default scheme. Google and Apple are what force the full config. | Adding Google/Apple sign-in — it is the usual Phase 1 time sink and deserves being written down first. |

---

## 11. Non-goals

Not building these. Listed so the decision isn't relitigated every time one seems appealing.

- **Collaboration / shared task lists.** Single-user, multi-device. Sharing changes the RLS model, the conflict model, and the realtime model at once.
- **Recurring tasks.** A recurrence engine (RRULE, exceptions, timezone-crossing DST) is larger than the rest of the app. Habits already cover "this repeats."
- **Push notifications.** Needs its own token lifecycle, permission flows, and a delivery service. Add when there is a user asking for a reminder.
- **Custom sync protocol.** TanStack Query's mutation queue plus Postgres timestamps is the whole engine. Do not write a sync layer.
- **A design system.** Tailwind tokens in one config file. Extract components at the third repetition, not the first.
- **Offline auth.** A cached session covers offline reads. Signing in requires a network. That is fine.
- **Web build.** Expo Router supports it and it will mostly work. It is not a target, not tested, and not a release blocker.
- **Analytics, crash reporting, feature flags.** Add when there are users to learn from.

---

## Appendix: installed agent skills

Installed to `.claude/skills/` (symlinked from `.agents/skills/`), scoped to this project. Nine, chosen for direct relevance to Orbit's path.

| Skill | Source | Covers |
|---|---|---|
| `expo-router` | official Expo | Route groups, native stack, modals, NativeTabs — §6.2 |
| `expo-project-structure` | official Expo | The `src/` layout §8 now follows |
| `expo-data-fetching` | official Expo | TanStack Query in Expo, offline references — §5 |
| `expo-tailwind-setup` | official Expo | NativeWind v5 + Tailwind v4 |
| `expo-dev-client` | official Expo | Dev builds — required for Google/Apple auth, §6.3 |
| `expo-upgrade` | official Expo | SDK 51 → 57, per §0.11 |
| `eas-app-stores` | official Expo | `eas build` / `eas submit`, TestFlight — Phase 4 |
| `vercel-react-native-skills` | vercel-labs (178K) | RN performance, list rendering |
| `react-native-best-practices` | Callstack (21K) | FPS, re-renders, FlashList, Hermes |

Already available and in use: `supabase`, `supabase-postgres-best-practices`, `tailwind-4-docs`, `ui-ux-pro-max`.

**Deliberately not installed:**

- `expo-api-routes` — Orbit's server code is Supabase Edge Functions, not Expo API routes.
- `eas-workflows`, `eas-observe`, `eas-update-insights` — CI, crash reporting, and OTA updates are all §11 non-goals.
- Every TanStack Query skill on the registry — the best has 9.7K installs from an unknown owner. The official docs cover the persistence and `onlineManager` APIs §5 depends on, and the provenance isn't worth it.
- Every "mobile offline support" skill — all under 500 installs from unknown owners, and all more generic than §5 already is.

```bash
npx skills check    # updates
```

---

## Appendix: verified references

Claims in this document that depend on current platform behavior, with sources:

- Realtime does not apply RLS to `DELETE` events; delete events cannot be filtered; `replica identity full` is required for old-record payloads; tables must be added to `supabase_realtime` — [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- RLS traps: `WITH CHECK` on UPDATE, `security_invoker` on views, `SECURITY DEFINER` exposure in `public`, `auth.role()` deprecation — [Product security](https://supabase.com/docs/guides/security/product-security)
- Expo SDK 57 is current as of July 2026 — [Expo SDK reference](https://docs.expo.dev/versions/latest/)
- Legacy Architecture removed in SDK 55; `newArchEnabled` ignored — [Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55)
- SecureStore's ~2048-byte ceiling vs. Supabase session size — [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [supabase#14523](https://github.com/supabase/supabase/issues/14523)
- Expo + Supabase client setup — [Use Supabase with Expo React Native](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native)
