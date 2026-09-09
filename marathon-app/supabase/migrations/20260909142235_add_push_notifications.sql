-- Multi-device push token registry. A row per (user, device) rather than a
-- single column on profiles, since one user can reasonably have more than
-- one device registered.
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('android', 'ios')),
  -- IANA name (e.g. "America/New_York"), captured from the device at
  -- registration time - the send-daily-notification cron job uses this to
  -- work out each user's own local hour, not the server's.
  timezone text not null,
  created_at timestamptz not null default now()
);

create unique index push_tokens_user_id_token_uidx on public.push_tokens (user_id, token);
create index push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy "push_tokens: select own" on public.push_tokens
  for select using (auth.uid() = user_id);

create policy "push_tokens: insert own" on public.push_tokens
  for insert with check (auth.uid() = user_id);

create policy "push_tokens: delete own" on public.push_tokens
  for delete using (auth.uid() = user_id);

-- no update policy - a changed/expired token is a delete + insert, not an
-- in-place edit (see lib/notifications/pushToken.ts)

comment on table public.push_tokens is 'Expo push tokens for the daily-notification cron job (send-daily-notification Edge Function) and any other future push use. Not read/written by any RLS-forwarding Edge Function - the cron job runs as service_role, bypassing RLS entirely, same as admin-set-approval.';

-- Daily-notification preferences on the existing profiles row, rather than
-- a separate table - these are simple per-user scalars, same pattern as
-- voice_coaching_enabled/voice_announcement_interval_km.
alter table public.profiles
  add column daily_notification_enabled boolean not null default true,
  add column notification_hour_local smallint not null default 7
    check (notification_hour_local between 0 and 23);

-- pg_cron/pg_net power the hourly trigger below - net.http_post lets a cron
-- job make an HTTP call (to the Edge Function) directly from Postgres.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Hourly, on the hour. Granularity is "within the hour," which is fine for
-- a daily wellness nudge - the function itself checks each user's actual
-- local hour against their own preference before doing anything.
-- Deployed with `--no-verify-jwt` (a cron trigger has no user JWT to
-- present), so no Authorization header/secret is needed here - the
-- function authenticates internally via its own SUPABASE_SERVICE_ROLE_KEY
-- secret (already configured for this project) to actually read/write data.
select cron.schedule(
  'send-daily-notification-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://lvjpgqhwsseqwbmexres.supabase.co/functions/v1/send-daily-notification',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
