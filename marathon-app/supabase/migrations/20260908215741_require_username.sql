-- Username becomes mandatory at signup, not an optional later Settings
-- edit. Existing accounts created before this change get a random
-- placeholder so the column can go NOT NULL without breaking them - they
-- can still change it from Settings whenever they like, same as today.

update public.profiles
set username = 'user' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
where username is null;

alter table public.profiles alter column username set not null;

-- Same reasoning as full_name (see handle_new_user_full_name.sql): read
-- from signup metadata rather than a follow-up client update, so it works
-- whether or not "Confirm email" is on (no session exists until confirmed).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, username)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

-- Anonymous signup can't read `profiles` at all under RLS (auth.uid() is
-- null pre-signup), so live "is this username taken" validation on the
-- sign-up form needs its own narrow, security-definer RPC rather than a
-- direct table read - returns only a boolean, never any profile data.
create or replace function public.username_available(desired text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (select 1 from public.profiles where username = lower(desired));
$$;

grant execute on function public.username_available(text) to anon, authenticated;
