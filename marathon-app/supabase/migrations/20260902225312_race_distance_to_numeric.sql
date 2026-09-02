-- Replace the fixed race_distance enum (5k/10k/half_marathon/marathon) with
-- a numeric distance in km, on both goals.race_distance and
-- goals.calibration_race_distance.
--
-- Found while extending the plan-generator engine (Task 3) to support any
-- custom race distance (15k, 30k) and ultra distances (50k, 100 miles,
-- etc.) - a fixed 4-value enum can't represent those. The numeric field is
-- also a strictly better design even for the original four distances: the
-- app UI can still offer 5k/10k/half/marathon as quick-select buttons that
-- just set the corresponding km value, but the data model and the plan
-- engine now work off the actual distance rather than a category label.
--
-- Safe to drop-and-recreate (not alter-in-place with a backfill) since no
-- real goals exist yet - confirmed empty auth.users in Task 2, and no
-- onboarding UI exists yet to have created any goals since.

-- Clean up the disposable test goal row left over from Task 2's RLS
-- verification test (test account, no real users exist yet) - it would
-- otherwise block the NOT NULL column add below.
delete from public.goals;

alter table public.goals drop column race_distance;
alter table public.goals add column race_distance_km numeric not null check (race_distance_km > 0);

alter table public.goals drop column if exists calibration_race_distance;
alter table public.goals add column calibration_race_distance_km numeric check (calibration_race_distance_km > 0);
