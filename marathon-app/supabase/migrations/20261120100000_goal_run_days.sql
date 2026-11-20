-- Explicit run days (docs/plan/implementation/10-readiness-based-planning.md, section 3i).
--
-- The runner now picks the exact weekdays they will run, then which of those
-- is the long-run day. run_days stores that choice so "Edit plan" and later
-- regenerations keep it. Nullable and additive: goals made before this keep
-- null and are shown with the days the engine would have chosen from
-- training_days_per_week. No RLS or grant change is needed (table-level grant
-- and "own rows" policies cover new columns). NOT applied by the app - run
-- `supabase db push`. Until then lib/data/goals.ts saves goals without it.

alter table public.goals
  add column run_days text[] check (
    run_days is null or (
      cardinality(run_days) between 1 and 7
      and run_days <@ array['mon','tue','wed','thu','fri','sat','sun']::text[]
    )
  );

comment on column public.goals.run_days is 'The weekdays the runner chose to run on (mon..sun), including long_run_day. Null means the engine spreads training_days_per_week itself.';
