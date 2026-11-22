-- Structured workouts (docs/plan/implementation/10-readiness-based-planning.md, section 3j).
--
-- A planned session is now stored as a named list of sections, each with its own distance and
-- pace (warm-up, the work, cool-down), so a tempo, a pyramid or a progressive long run can all be
-- shown and followed. workout holds that list as json:
--   { "family": "pyramid", "name": "Pyramid Intervals",
--     "segments": [ { "kind": "warmup", "label": "Warm up", "distanceMeters": 1300, "paceSecondsPerKm": 480 }, ... ] }
--
-- Nullable and additive: sessions made before this keep null and keep showing as they always did
-- (interval_structure or the flat distance and pace). No RLS or grant change is needed - plan_sessions
-- already has a table-level grant and "own rows" policies, which cover new columns. This migration is
-- NOT applied by the app - run it with `supabase db push`. Until it is applied, lib/data/plans.ts
-- saves sessions without this column and everything else keeps working.

alter table public.plan_sessions
  add column workout jsonb;

comment on column public.plan_sessions.workout is 'The session as ordered sections (family, name, segments[kind,label,distanceMeters,paceSecondsPerKm]). Null for sessions made before structured workouts.';
