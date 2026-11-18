-- Post-run reflection (docs/plan/09-cursus-rebrand-redesign.md, Phase 4c).
--
-- activities.rpe and activities.notes already exist and keep holding the 1-10
-- effort and the free-text note. These columns add the rest of the reflection.
-- Every one is nullable, so existing rows and the existing insert paths
-- (manual log, GPS save, Health Connect sync) are untouched.
--
-- No RLS or grant changes are needed: activities already has a table-level
-- grant plus an "update own" policy, and a new column falls under both.
-- This migration is NOT applied by the app - run it with `supabase db push`.
-- Until it is applied, lib/data/reflection.ts falls back to saving only the
-- effort, notes and shoe (columns that already exist).
--
-- (The "meet your runs" explainer's seen-flag lives on the device, in
-- AsyncStorage, so no profiles column is needed.)

alter table public.activities
  add column feel smallint check (feel between 1 and 5),
  add column body_tags text[],
  add column condition_tags text[],
  add column reflected_at timestamptz;

comment on column public.activities.feel is 'Post-run face, 1 (easy) to 5 (max). Maps to rpe 2/4/6/8/10 (lib/reflection/insight.ts feelToRpe); rpe stays the source the rest of the app reads.';
comment on column public.activities.body_tags is 'Optional post-run chips for how the body felt (Fresh, Heavy legs, Tired, Tight calves, A niggle).';
comment on column public.activities.condition_tags is 'Optional post-run chips for conditions (Hot, Cold, Windy, Hilly, Rain).';
comment on column public.activities.reflected_at is 'When the reflection was saved; null until the runner completes or skips past it.';
