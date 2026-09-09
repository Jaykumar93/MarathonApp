-- Persistent in-app notification inbox. Distinct from the daily AI
-- motivation push (send-daily-notification) - that one is deliberately
-- OS-push-only/ephemeral. This table is for things that should still be
-- visible in-app even if the push was missed/dismissed - starting with
-- missed-run reminders (see markPastPendingAsMissed in lib/data/plans.ts,
-- which returns exactly the rows it just flipped so a row here is only
-- ever created once per missed session, never re-notified on a later
-- reload).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('missed_run')),
  title text not null,
  body text not null,
  -- which planned session this is about, if any - lets the notification
  -- screen link straight to it. on delete set null (not cascade): a
  -- session row is never actually deleted (see plan_sessions' own
  -- no-delete-policy comment), but this stays defensive either way.
  plan_session_id uuid references public.plan_sessions (id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_id_created_at_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications: select own" on public.notifications
  for select using (auth.uid() = user_id);

create policy "notifications: insert own" on public.notifications
  for insert with check (auth.uid() = user_id);

create policy "notifications: update own" on public.notifications
  for update using (auth.uid() = user_id);

-- no delete policy - same reasoning as plan_sessions/goals/plans: mark
-- read, don't remove the record.

comment on table public.notifications is 'Persistent in-app notification inbox (missed-run reminders, etc) - NOT the daily AI motivation push, which stays OS-only/ephemeral by design.';

-- Grant the baseline table privilege up front this time - three separate
-- follow-up migrations already had to patch this exact gap in for other
-- tables (push_tokens, knowledge_base, profiles/plan_sessions for
-- service_role) because `supabase db push` doesn't inherit the dashboard's
-- default grants.
grant select, insert, update on public.notifications to authenticated;
