-- goals.calibration_race_time_seconds was added in the initial schema with
-- no accompanying distance field. Found while designing the plan-generator
-- engine (Task 3): Riegel's formula (T2 = T1 * (D2/D1)^1.06) needs both the
-- calibration race's time AND its distance to predict anything — a time
-- alone is meaningless without knowing what distance it was run over.

alter table public.goals
  add column calibration_race_distance text
    check (calibration_race_distance in ('5k', '10k', 'half_marathon', 'marathon'));
