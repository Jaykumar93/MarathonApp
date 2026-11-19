-- Readiness-based planning (docs/plan/10-readiness-based-planning.md).
--
-- Three optional answers the runner gives about their running, stored on the
-- goal so "Edit plan" and later regenerations keep using them:
--   longest_recent_run_km  the longest run in roughly the last month, in km
--   time_off               time off regular running
--   calibration_race_when  how long ago the calibration race was
--
-- All three are nullable and additive, so existing goals and every existing
-- insert and update path are untouched. No RLS or grant change is needed:
-- goals already has a table-level grant and "own rows" policies, which cover
-- new columns. This migration is NOT applied by the app - run it with
-- `supabase db push`. Until it is applied, lib/data/goals.ts saves goals
-- without these three columns and everything else keeps working.

alter table public.goals
  add column longest_recent_run_km numeric check (longest_recent_run_km is null or (longest_recent_run_km >= 0 and longest_recent_run_km <= 300)),
  add column time_off text check (time_off is null or time_off in ('none', '1_3_months', '3_12_months', 'over_year')),
  add column calibration_race_when text check (calibration_race_when is null or calibration_race_when in ('under_3_months', '3_12_months', '1_2_years', 'over_2_years'));

comment on column public.goals.longest_recent_run_km is 'Self-reported longest run in about the last month (km). Feeds the plan engine''s long-run guard when there are no logged runs.';
comment on column public.goals.time_off is 'Self-reported time off regular running: none, 1_3_months, 3_12_months or over_year. Marks a returning runner in the plan engine.';
comment on column public.goals.calibration_race_when is 'How long ago the calibration race (calibration_race_*) was run. An old race says less about today''s fitness.';
