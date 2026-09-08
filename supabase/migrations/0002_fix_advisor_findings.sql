-- Fixes from `get_advisors` after 0001. Run advisors after every migration —
-- it catches missing RLS, unindexed policy columns, and security_invoker-less
-- views, which are the three ways an otherwise-correct schema leaks.

-- WARN: function_search_path_mutable.
-- handle_new_user already pinned its search_path; touch_updated_at did not.
-- An unpinned search_path lets a caller's path decide what unqualified names
-- resolve to inside the function body.
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- INFO: unindexed_foreign_keys.
-- The composite FK (habit_id, user_id) had no covering index, so cascading a
-- habit delete would scan habit_entries. The unique (habit_id, entry_date)
-- index does not cover the FK's column set.
create index entries_habit_user_idx on public.habit_entries (habit_id, user_id);

-- Still reported after this migration, and intentional:
--   • rls_enabled_no_policy on public.ai_usage — RLS on with zero policies is
--     default-deny. The table is unreachable from the client by design (§7.2).
--   • unused_index × 9 — the database has served no queries yet. Re-check once
--     Phase 2 has real traffic before removing anything.
