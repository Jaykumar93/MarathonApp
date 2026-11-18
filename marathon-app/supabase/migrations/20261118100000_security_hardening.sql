-- Security hardening from the 2026-11-18 audit (findings F1, F2, F3).
-- NOT applied by the app - review, then run `supabase db push`.
--
-- F1: any signed-in user could `PATCH profiles` with {"is_admin": true}. The
--     table-wide UPDATE grant and the "update own" policy let them write every
--     column, and protect_waitlist_status only guarded status/access_granted.
--     is_admin is now guarded the same way (service role / direct SQL only).
-- F2: waitlist approval was enforced only by the app's router. A restrictive
--     policy now requires status = 'approved' on every user-data table, so a
--     pending or rejected user cannot use the API directly. profiles itself is
--     left alone so a pending user can still read their own row and see the
--     waitlist screen.
-- F3: push_tokens.timezone is user-writable and the daily-notification function
--     feeds it to Intl.DateTimeFormat, which throws on a bad zone. A trigger now
--     replaces any zone Postgres does not know with 'UTC'.

-- ---------------------------------------------------------------- F1
create or replace function public.protect_waitlist_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- A genuine service_role request, or a connection with no PostgREST JWT
  -- context at all (role IS NULL: SQL editor, CLI, migrations), is privileged.
  -- Every client request through PostgREST carries 'anon' or 'authenticated'.
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.access_granted is distinct from old.access_granted
     or new.is_admin is distinct from old.is_admin then
    raise exception 'status, access_granted and is_admin can only be changed by the service role';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------- F2
create or replace function public.is_approved(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.status = 'approved' from public.profiles p where p.id = uid), false);
$$;

revoke all on function public.is_approved(uuid) from public, anon;
grant execute on function public.is_approved(uuid) to authenticated;

-- Restrictive policies are ANDed with the existing permissive ones, so each
-- table keeps its "own rows only" rule and gains "and the user is approved".
do $$
declare
  t text;
begin
  foreach t in array array[
    'goals', 'plans', 'plan_sessions', 'shoes', 'activities',
    'coach_messages', 'push_tokens', 'notifications'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || ': approved users only', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using ((select public.is_approved(auth.uid())))',
      t || ': approved users only', t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------- F3
create or replace function public.normalize_push_token_timezone()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.timezone is null
     or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    new.timezone := 'UTC';
  end if;
  return new;
end;
$$;

drop trigger if exists push_tokens_normalize_timezone on public.push_tokens;
create trigger push_tokens_normalize_timezone
  before insert or update of timezone on public.push_tokens
  for each row execute function public.normalize_push_token_timezone();

-- One-off cleanup of any row already holding an unknown zone.
update public.push_tokens
set timezone = 'UTC'
where not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = push_tokens.timezone);
