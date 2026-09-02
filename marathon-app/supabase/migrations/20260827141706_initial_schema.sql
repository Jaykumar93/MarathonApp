-- Initial schema: profiles, plans, activities, shoes
-- Waitlist gate lives on profiles.status; only the service role (Supabase
-- table editor / dashboard) can change it — enforced by trigger below,
-- not just by RLS, so a misconfigured policy can't let users self-approve.

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

  -- onboarding inputs (5-step onboarding, first login only)
  race_distance text check (race_distance in ('5k', '10k', 'half_marathon', 'marathon')),
  goal_date date,
  current_weekly_mileage_km numeric,
  experience_level text check (experience_level in ('beginner', 'intermediate', 'advanced')),
  calibration_race_time_seconds integer,
  training_days_per_week integer check (training_days_per_week between 1 and 7),
  long_run_day text check (long_run_day in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  health_data_source text check (health_data_source in ('health_connect', 'healthkit', 'manual', 'none')),
  onboarding_completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. status/access_granted are only mutable by the service role (waitlist approval happens in the Supabase table editor, never client-side).';

-- ============================================================
-- plans
-- ============================================================
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  race_distance text not null check (race_distance in ('5k', '10k', 'half_marathon', 'marathon')),
  goal_date date not null,
  start_date date not null,

  -- full periodized plan (base/build/peak/taper, session-level detail per day)
  -- produced by the plan-generator engine (Task 3). Structure owned by that
  -- module, not fixed here — kept as jsonb deliberately.
  plan_original jsonb not null,
  plan_active jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.plans is 'plan_original is immutable once created; plan_active reflects adjustments accepted by the user. The rule engine (not the LLM) owns everything inside these jsonb blobs.';

create index plans_user_id_idx on public.plans (user_id);

-- ============================================================
-- shoes
-- ============================================================
create table public.shoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  name text not null,
  brand text,
  cumulative_distance_km numeric not null default 0,
  retirement_threshold_km numeric not null default 725, -- ~450mi midpoint of the 400-500mi range
  retired boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shoes_user_id_idx on public.shoes (user_id);

-- ============================================================
-- activities
-- ============================================================
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  source text not null check (source in ('health_connect', 'healthkit', 'manual')),
  activity_type text not null default 'run',
  start_time timestamptz not null,
  distance_meters numeric not null,
  duration_seconds integer not null,

  -- physiology
  avg_heart_rate integer,
  max_heart_rate integer,
  avg_cadence integer,
  calories integer,

  -- terrain
  elevation_gain_meters numeric,
  elevation_loss_meters numeric,

  -- rich detail
  splits jsonb,        -- per-km/mile split data
  route jsonb,         -- polyline / coordinate array

  -- subjective (post-run, always skippable — never save-blocking)
  rpe integer check (rpe between 1 and 10),
  notes text,
  shoe_id uuid references public.shoes (id) on delete set null,
  weather jsonb,        -- informational only, never feeds plan generation

  -- plan linkage
  plan_id uuid references public.plans (id) on delete set null,
  plan_session_date date,
  planned_vs_actual jsonb,

  created_at timestamptz not null default now()
);

create index activities_user_id_idx on public.activities (user_id);
create index activities_plan_id_idx on public.activities (plan_id);
create index activities_start_time_idx on public.activities (start_time desc);

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

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

create trigger shoes_set_updated_at
  before update on public.shoes
  for each row execute function public.set_updated_at();

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

-- ============================================================
-- guard against client-side waitlist self-approval
-- ============================================================
create function public.protect_waitlist_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- service_role (dashboard / table editor / server-side) bypasses this guard entirely
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.status is distinct from old.status or new.access_granted is distinct from old.access_granted then
    new.status = old.status;
    new.access_granted = old.access_granted;
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
alter table public.plans enable row level security;
alter table public.shoes enable row level security;
alter table public.activities enable row level security;

create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

-- no insert policy for profiles: rows are created exclusively by the
-- handle_new_user trigger (security definer), not directly by clients.

create policy "plans: select own" on public.plans
  for select using (auth.uid() = user_id);

create policy "plans: insert own" on public.plans
  for insert with check (auth.uid() = user_id);

create policy "plans: update own" on public.plans
  for update using (auth.uid() = user_id);

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
