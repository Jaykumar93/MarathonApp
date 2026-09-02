-- Initial schema: profiles, goals, plans, plan_sessions, shoes, activities
--
-- Scope note: this migration covers the core training loop (auth/waitlist,
-- goals, plans, sessions, logging, gear). AI Coach tables (knowledge_base,
-- coach_messages) are deliberately NOT included yet — the embedding
-- dimension depends on which embedding model gets picked in Task 8, and
-- pushing an empty pgvector table now would lock in an unmade decision.
--
-- Waitlist gate lives on profiles.status; only the service role (Supabase
-- table editor / dashboard) can change it — enforced by trigger below,
-- not just by RLS, so a misconfigured policy can't let users self-approve.
--
-- Reviewed by a dedicated schema-review pass before push; see
-- docs/plan/02-supabase-backend.md for the fixes applied as a result
-- (waitlist-trigger dashboard bug, goal-lifecycle cascade, activity dedup,
-- ownership-consistency triggers, shoe-mileage maintenance, etc).

-- ============================================================
-- profiles
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  access_granted boolean not null default false,
  push_token text,

  health_data_source text check (health_data_source in ('health_connect', 'healthkit', 'manual', 'none')),
  onboarding_completed_at timestamptz,

  -- app preferences (Settings screen)
  theme_preference text not null default 'light' check (theme_preference in ('light', 'dark')),
  distance_unit text not null default 'km' check (distance_unit in ('km', 'mi')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_access_requires_approved check (not access_granted or status = 'approved')
);

comment on table public.profiles is 'One row per auth user — identity/account/preferences only. status/access_granted are only mutable by the service role (waitlist approval happens in the Supabase table editor, never client-side). Goal-specific data lives in goals, not here, since a user has many goals over time.';

-- ============================================================
-- goals
-- ============================================================
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  race_distance text not null check (race_distance in ('5k', '10k', 'half_marathon', 'marathon')),
  goal_date date not null,
  target_time_seconds integer, -- goal finish time; drives Pace Band goal-pace math. Optional (skippable in onboarding).

  -- fitness snapshot at the time this goal/cycle was set up (onboarding steps 2-4)
  current_weekly_mileage_km numeric,
  experience_level text check (experience_level in ('beginner', 'intermediate', 'advanced')),
  calibration_race_time_seconds integer,
  training_days_per_week integer check (training_days_per_week between 1 and 7),
  long_run_day text check (long_run_day in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),

  -- editable morning-of checklist (Race Day Details). Small, low-churn list —
  -- app seeds sensible defaults, user can add/remove/check items. Doesn't
  -- need its own table: no independent lifecycle, always read/written whole.
  race_day_checklist jsonb not null default '[]'::jsonb,

  is_complete boolean not null default false,
  is_deleted boolean not null default false,
  completed_at timestamptz,
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.goals is 'One row per training cycle/race target. A user accumulates goal history over time — completing or deleting a goal never deletes the row, it flips is_complete/is_deleted so past cycles stay visible. Completing/deleting cascades to close out the goal''s current plan and remaining pending sessions (see cascade_goal_lifecycle).';

create index goals_user_id_idx on public.goals (user_id);

-- at most one goal per user that is neither complete nor deleted
create unique index goals_one_active_per_user
  on public.goals (user_id)
  where is_complete = false and is_deleted = false;

-- ============================================================
-- plans
-- ============================================================
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,

  start_date date not null,

  -- full plan as originally generated — immutable snapshot, kept for
  -- comparison against plan_sessions even after adjustments are applied.
  -- Session-level detail itself lives in plan_sessions (normalized), not
  -- nested in this blob — this is a reference copy, not the operational data.
  plan_original jsonb not null,

  -- adjustment-prompt bookkeeping: implements "never re-prompted immediately
  -- if declined" from the adaptive-adjustment spec
  last_adjustment_prompted_at timestamptz,
  last_adjustment_declined_at timestamptz,

  -- a goal can be regenerated into a fresh plan without losing the old
  -- attempt: regenerating sets is_deleted=true on the superseded row and
  -- inserts a new one (with its own fresh plan_sessions), rather than
  -- overwriting plan_original in place.
  is_deleted boolean not null default false,
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.plans is 'plan_original is an immutable snapshot for reference/comparison. Operational day-to-day data (what changes as sessions complete or get moved) lives in plan_sessions, not in a plan_active blob — see plan_sessions. Race target/goal_date come from the linked goal, not duplicated here. A goal can have multiple plan rows over time (regeneration history) — exactly one is "current" per goal at any time (see plans_one_current_per_goal). Automatically soft-deleted when its goal is completed/deleted (see cascade_goal_lifecycle).';

create index plans_user_id_idx on public.plans (user_id);
create index plans_goal_id_idx on public.plans (goal_id);

-- at most one *current* (non-superseded) plan per goal — old regeneration
-- attempts stay in the table with is_deleted=true instead of being removed
create unique index plans_one_current_per_goal
  on public.plans (goal_id)
  where is_deleted = false;

-- keep plans.user_id consistent with its goal's owner (defense in depth
-- beyond RLS — stops a plan ever being linked to someone else's goal)
create function public.enforce_plan_goal_owner()
returns trigger
language plpgsql
as $$
declare
  goal_owner uuid;
begin
  select user_id into goal_owner from public.goals where id = new.goal_id;
  if goal_owner is null or goal_owner <> new.user_id then
    raise exception 'plans.user_id must match the owner of the linked goal';
  end if;
  return new;
end;
$$;

create trigger plans_enforce_goal_owner
  before insert or update on public.plans
  for each row execute function public.enforce_plan_goal_owner();

-- ============================================================
-- plan_sessions
-- ============================================================
create table public.plan_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,

  session_date date not null,
  week_number integer not null,
  phase text not null check (phase in ('base', 'build', 'peak', 'taper')),
  session_type text not null check (session_type in ('easy', 'tempo', 'long', 'interval', 'rest')),

  planned_distance_meters numeric check (planned_distance_meters is null or planned_distance_meters >= 0),
  planned_duration_seconds integer check (planned_duration_seconds is null or planned_duration_seconds >= 0),
  planned_pace_seconds_per_km numeric check (planned_pace_seconds_per_km is null or planned_pace_seconds_per_km >= 0),

  -- pre-run fueling/warmup, post-run cooldown/refuel — populated by the
  -- plan-generator engine from static app-bundled templates (matched by
  -- session_type/duration), stored per-row so it's a durable record of
  -- what was actually shown, not re-derived later from a template that
  -- might change.
  prep_recovery jsonb,

  -- 'cancelled' is distinct from 'missed': a session becomes 'cancelled'
  -- when its goal is completed/deleted out from under it (see
  -- cascade_goal_lifecycle) — it was never actually missed by the user.
  status text not null default 'pending' check (status in ('pending', 'completed', 'missed', 'moved', 'cancelled')),
  original_session_date date, -- set when status='moved'; preserves what was originally planned, for adaptive-adjustment comparison

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.plan_sessions is 'One row per planned training day. This is the operational, frequently-mutated half of a plan (today''s session lookup, move/mark-done actions, calendar-strip colors, Block Profile per-day fill) — kept normalized rather than nested in a plan JSON blob specifically so those are cheap single-row operations, not read-modify-write of a whole blob.';

create index plan_sessions_user_id_session_date_idx on public.plan_sessions (user_id, session_date);

-- also serves as the lookup index for plan_id alone (leftmost column),
-- so no separate plan_id-only index is needed
create unique index plan_sessions_plan_id_session_date_uidx
  on public.plan_sessions (plan_id, session_date);

-- keep plan_sessions.user_id consistent with its plan's owner
create function public.enforce_session_plan_owner()
returns trigger
language plpgsql
as $$
declare
  plan_owner uuid;
begin
  select user_id into plan_owner from public.plans where id = new.plan_id;
  if plan_owner is null or plan_owner <> new.user_id then
    raise exception 'plan_sessions.user_id must match the owner of the linked plan';
  end if;
  return new;
end;
$$;

create trigger plan_sessions_enforce_plan_owner
  before insert or update on public.plan_sessions
  for each row execute function public.enforce_session_plan_owner();

-- ============================================================
-- shoes
-- ============================================================
create table public.shoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  name text not null,
  brand text,
  -- maintained automatically from activities.distance_meters — see
  -- maintain_shoe_mileage. Never write to this column directly from the app.
  cumulative_distance_km numeric not null default 0,
  retirement_threshold_km numeric not null default 725, -- ~450mi midpoint of the 400-500mi range
  retired boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.shoes is 'cumulative_distance_km is trigger-maintained from activities (see maintain_shoe_mileage) — it reflects the sum of every activity currently tagged with this shoe, kept in sync on insert/update/delete rather than being a client-managed counter that can drift.';

create index shoes_user_id_idx on public.shoes (user_id);

-- ============================================================
-- activities
-- ============================================================
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  source text not null check (source in ('health_connect', 'healthkit', 'manual')),
  -- identifier from the source system (Health Connect/HealthKit record id),
  -- used to deduplicate re-synced workouts. NULL for manual entries.
  external_id text,
  activity_type text not null default 'run',
  start_time timestamptz not null,
  distance_meters numeric not null check (distance_meters >= 0),
  duration_seconds integer not null check (duration_seconds >= 0),

  -- physiology
  avg_heart_rate integer check (avg_heart_rate is null or avg_heart_rate > 0),
  max_heart_rate integer check (max_heart_rate is null or max_heart_rate > 0),
  avg_cadence integer check (avg_cadence is null or avg_cadence > 0),
  calories integer check (calories is null or calories >= 0),

  -- terrain
  elevation_gain_meters numeric check (elevation_gain_meters is null or elevation_gain_meters >= 0),
  elevation_loss_meters numeric check (elevation_loss_meters is null or elevation_loss_meters >= 0),

  -- rich detail
  splits jsonb,        -- per-km/mile split data
  route jsonb,         -- polyline / coordinate array

  -- subjective (post-run, always skippable — never save-blocking)
  rpe integer check (rpe between 1 and 10),
  notes text,
  shoe_id uuid references public.shoes (id) on delete set null,
  weather jsonb,        -- informational only, never feeds plan generation

  -- plan linkage
  plan_id uuid references public.plans (id) on delete set null,               -- which block this belongs to (may be set even without a specific session match)
  plan_session_id uuid references public.plan_sessions (id) on delete set null, -- which specific planned session this fulfills, if any
  planned_vs_actual jsonb,

  created_at timestamptz not null default now()
);

comment on table public.activities is 'shoe_id/plan_id/plan_session_id are ownership-checked against user_id by enforce_activity_links_owner, same pattern as plans/plan_sessions — RLS alone only checks user_id=auth.uid(), it does not verify these cross-links point at the same user''s own rows.';

create index activities_user_id_start_time_idx on public.activities (user_id, start_time desc);
create index activities_plan_id_idx on public.activities (plan_id);
create index activities_plan_session_id_idx on public.activities (plan_session_id);
create index activities_shoe_id_idx on public.activities (shoe_id);

-- dedupe re-synced workouts from Health Connect/HealthKit. Manual entries
-- (external_id is null) are correctly excluded from this constraint.
create unique index activities_source_external_id_uidx
  on public.activities (user_id, source, external_id)
  where external_id is not null;

-- keep shoe_id/plan_id/plan_session_id consistent with activities.user_id
-- (defense in depth beyond RLS, same reasoning as enforce_plan_goal_owner)
create function public.enforce_activity_links_owner()
returns trigger
language plpgsql
as $$
declare
  owner uuid;
begin
  if new.shoe_id is not null then
    select user_id into owner from public.shoes where id = new.shoe_id;
    if owner is null or owner <> new.user_id then
      raise exception 'activities.shoe_id must belong to the same user';
    end if;
  end if;

  if new.plan_id is not null then
    select user_id into owner from public.plans where id = new.plan_id;
    if owner is null or owner <> new.user_id then
      raise exception 'activities.plan_id must belong to the same user';
    end if;
  end if;

  if new.plan_session_id is not null then
    select user_id into owner from public.plan_sessions where id = new.plan_session_id;
    if owner is null or owner <> new.user_id then
      raise exception 'activities.plan_session_id must belong to the same user';
    end if;
  end if;

  return new;
end;
$$;

create trigger activities_enforce_links_owner
  before insert or update on public.activities
  for each row execute function public.enforce_activity_links_owner();

-- maintain shoes.cumulative_distance_km from activities, so it's never a
-- client-managed value that can silently drift
create function public.maintain_shoe_mileage()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.shoe_id is not null then
      update public.shoes set cumulative_distance_km = cumulative_distance_km + (new.distance_meters / 1000.0)
        where id = new.shoe_id;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.shoe_id is not distinct from new.shoe_id and old.distance_meters is not distinct from new.distance_meters then
      return new;
    end if;
    if old.shoe_id is not null then
      update public.shoes set cumulative_distance_km = cumulative_distance_km - (old.distance_meters / 1000.0)
        where id = old.shoe_id;
    end if;
    if new.shoe_id is not null then
      update public.shoes set cumulative_distance_km = cumulative_distance_km + (new.distance_meters / 1000.0)
        where id = new.shoe_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.shoe_id is not null then
      update public.shoes set cumulative_distance_km = cumulative_distance_km - (old.distance_meters / 1000.0)
        where id = old.shoe_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

create trigger activities_maintain_shoe_mileage
  after insert or update or delete on public.activities
  for each row execute function public.maintain_shoe_mileage();

-- ============================================================
-- updated_at maintenance
-- ============================================================
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

create trigger plan_sessions_set_updated_at
  before update on public.plan_sessions
  for each row execute function public.set_updated_at();

create trigger shoes_set_updated_at
  before update on public.shoes
  for each row execute function public.set_updated_at();

-- stamp completed_at/deleted_at automatically when the flags flip on,
-- so clients just set the boolean rather than also setting the timestamp
create function public.stamp_goal_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if new.is_complete and not old.is_complete then
    new.completed_at = now();
  end if;
  if new.is_deleted and not old.is_deleted then
    new.deleted_at = now();
  end if;
  return new;
end;
$$;

create trigger goals_stamp_lifecycle
  before update on public.goals
  for each row execute function public.stamp_goal_lifecycle();

-- completing/deleting a goal is one-way: once is_complete or is_deleted is
-- set, it can never be flipped back. Keeps history honest — a goal that
-- was "undone" would leave a confusing trail (stale completed_at/deleted_at
-- alongside cascaded plan/session state that isn't automatically restored).
create function public.enforce_goal_lifecycle_one_way()
returns trigger
language plpgsql
as $$
begin
  if old.is_complete and not new.is_complete then
    raise exception 'goals.is_complete cannot be reversed once set';
  end if;
  if old.is_deleted and not new.is_deleted then
    raise exception 'goals.is_deleted cannot be reversed once set';
  end if;
  return new;
end;
$$;

create trigger goals_enforce_lifecycle_one_way
  before update on public.goals
  for each row execute function public.enforce_goal_lifecycle_one_way();

-- when a goal is completed or deleted, close out its current plan and any
-- remaining pending sessions — otherwise they'd stay fully "live" (stale
-- "current" plan, stale pending sessions today's-session queries could
-- surface) even though the goal that owns them is done.
create function public.cascade_goal_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if (new.is_complete and not old.is_complete) or (new.is_deleted and not old.is_deleted) then
    update public.plans
      set is_deleted = true
      where goal_id = new.id and is_deleted = false;

    update public.plan_sessions
      set status = 'cancelled'
      where plan_id in (select id from public.plans where goal_id = new.id)
        and status = 'pending';
  end if;
  return new;
end;
$$;

create trigger goals_cascade_lifecycle
  after update on public.goals
  for each row execute function public.cascade_goal_lifecycle();

-- same idea for plans: stamp deleted_at automatically when a plan is
-- superseded by a regenerated one for the same goal
create function public.stamp_plan_deleted_at()
returns trigger
language plpgsql
as $$
begin
  if new.is_deleted and not old.is_deleted then
    new.deleted_at = now();
  end if;
  return new;
end;
$$;

create trigger plans_stamp_deleted_at
  before update on public.plans
  for each row execute function public.stamp_plan_deleted_at();

-- same one-way rule as goals: a superseded plan stays superseded
create function public.enforce_plan_lifecycle_one_way()
returns trigger
language plpgsql
as $$
begin
  if old.is_deleted and not new.is_deleted then
    raise exception 'plans.is_deleted cannot be reversed once set';
  end if;
  return new;
end;
$$;

create trigger plans_enforce_lifecycle_one_way
  before update on public.plans
  for each row execute function public.enforce_plan_lifecycle_one_way();

-- ============================================================
-- auto-create profile row on signup (status defaults to 'pending')
-- ============================================================
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep profiles.email in sync if the user changes their login email via
-- Supabase Auth (handle_new_user only fires on insert, never update)
create function public.handle_user_email_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ============================================================
-- guard against client-side waitlist self-approval
-- ============================================================
create function public.protect_waitlist_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Treat as privileged: a genuine service_role request (role = 'service_role')
  -- OR any connection with no PostgREST JWT context at all (role IS NULL) —
  -- which is what direct Postgres connections look like, including the
  -- Supabase Table Editor / SQL Editor / CLI. A real client request routed
  -- through PostgREST always carries a role of 'anon' or 'authenticated',
  -- never NULL, so NULL safely means "not a client".
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;

  if new.status is distinct from old.status or new.access_granted is distinct from old.access_granted then
    raise exception 'status and access_granted can only be changed by the service role';
  end if;

  return new;
end;
$$;

create trigger profiles_protect_waitlist_status
  before update on public.profiles
  for each row execute function public.protect_waitlist_status();

-- ============================================================
-- row level security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.plans enable row level security;
alter table public.plan_sessions enable row level security;
alter table public.shoes enable row level security;
alter table public.activities enable row level security;

create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

-- no insert policy for profiles: rows are created exclusively by the
-- handle_new_user trigger (security definer), not directly by clients.

create policy "goals: select own" on public.goals
  for select using (auth.uid() = user_id);

create policy "goals: insert own" on public.goals
  for insert with check (auth.uid() = user_id);

create policy "goals: update own" on public.goals
  for update using (auth.uid() = user_id);

-- no delete policy on goals: completing/abandoning a goal is a soft flag
-- (is_complete / is_deleted), never a hard delete — that's how history survives.

create policy "plans: select own" on public.plans
  for select using (auth.uid() = user_id);

create policy "plans: insert own" on public.plans
  for insert with check (auth.uid() = user_id);

create policy "plans: update own" on public.plans
  for update using (auth.uid() = user_id);

-- no delete policy on plans: regeneration soft-deletes (is_deleted), same
-- reasoning as goals — old plan attempts stay queryable as history.

create policy "plan_sessions: select own" on public.plan_sessions
  for select using (auth.uid() = user_id);

create policy "plan_sessions: insert own" on public.plan_sessions
  for insert with check (auth.uid() = user_id);

create policy "plan_sessions: update own" on public.plan_sessions
  for update using (auth.uid() = user_id);

-- no delete policy on plan_sessions: a session's status moves to
-- 'missed'/'moved'/'cancelled', it's never removed — that's the historical
-- record of what was actually planned, even after the fact.

create policy "shoes: select own" on public.shoes
  for select using (auth.uid() = user_id);

create policy "shoes: insert own" on public.shoes
  for insert with check (auth.uid() = user_id);

create policy "shoes: update own" on public.shoes
  for update using (auth.uid() = user_id);

create policy "shoes: delete own" on public.shoes
  for delete using (auth.uid() = user_id);

create policy "activities: select own" on public.activities
  for select using (auth.uid() = user_id);

create policy "activities: insert own" on public.activities
  for insert with check (auth.uid() = user_id);

create policy "activities: update own" on public.activities
  for update using (auth.uid() = user_id);

create policy "activities: delete own" on public.activities
  for delete using (auth.uid() = user_id);
