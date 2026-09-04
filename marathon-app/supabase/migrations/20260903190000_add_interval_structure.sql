-- The warmup/reps/recovery/cooldown shape of an interval workout - only
-- ever populated for session_type 'interval' sessions generated from now
-- on (see lib/planEngine/intervalStructure.ts). Existing interval sessions
-- from before this migration stay null and keep falling back to the flat
-- planned_pace_seconds_per_km guidance they always had - no backfill.
alter table public.plan_sessions
  add column interval_structure jsonb;
