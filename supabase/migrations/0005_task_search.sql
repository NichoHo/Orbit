alter table public.tasks
  add column fts tsvector generated always as (to_tsvector('english', title || ' ' || coalesce(description, ''))) stored;

create index tasks_fts_idx on public.tasks using gin (fts);
