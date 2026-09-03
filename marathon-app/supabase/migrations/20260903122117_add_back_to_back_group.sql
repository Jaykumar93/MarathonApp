-- The plan-generator engine (Task 3) produces a backToBackGroup field on
-- ultra plan sessions (pairs a Saturday+Sunday back-to-back long run under
-- a shared id) but plan_sessions had no column to persist it - found while
-- wiring the engine's output to Supabase in Task 4.

alter table public.plan_sessions
  add column back_to_back_group text;
