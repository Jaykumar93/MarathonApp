-- Soft-delete for activities, matching the one-way soft-delete pattern
-- already used for goals/plans (deleteGoal/supersedePlan) - a logged run
-- is training history, so removing it from the app should hide it rather
-- than destroy the row.
alter table public.activities
  add column is_deleted boolean not null default false;

create index activities_is_deleted_idx on public.activities (user_id, is_deleted);
