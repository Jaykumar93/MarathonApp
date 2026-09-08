-- Admin panel (in-app waitlist approve/revoke, Settings-only entry point).
-- is_admin is a plain flag, not a role system - this app only ever expects
-- one or a small handful of trusted admins, not a permissions hierarchy.
alter table public.profiles add column is_admin boolean not null default false;

-- SECURITY DEFINER so this function's own lookup bypasses RLS - a plain
-- policy like `using (exists (select 1 from profiles where id = auth.uid()
-- and is_admin))` recurses into itself (Postgres evaluates RLS on the
-- subquery's own scan of the same table), which errors with "infinite
-- recursion detected in policy for relation profiles". This is the
-- standard fix for a self-referential "is this caller special" check.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = uid), false);
$$;

-- Additive alongside the existing "profiles: select own" policy (Postgres
-- OR's multiple policies for the same command) - everyone keeps seeing
-- their own row exactly as before, an admin additionally sees every row,
-- for the pending/approved list in the admin screen.
create policy "profiles: admin select all"
  on public.profiles for select
  using (public.is_admin(auth.uid()));

-- Actual approve/revoke writes never go through this policy or client
-- RLS at all - protect_waitlist_status already blocks any non-service-role
-- update to status/access_granted, so the mutation path is the
-- admin-set-approval Edge Function (service role), which independently
-- re-checks is_admin() server-side before writing. This SELECT policy only
-- covers reading the list.

update public.profiles set is_admin = true where email = 'www.jaykumarpokar@gmail.com';
