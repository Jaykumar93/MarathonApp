-- Pull full_name from the signup form into profiles automatically.
--
-- Passed via supabase.auth.signUp({ options: { data: { full_name } } }) on
-- the client, which lands in auth.users.raw_user_meta_data - read here
-- rather than requiring a follow-up UPDATE after signup, so it works
-- correctly regardless of whether "Confirm email" is on (no session exists
-- until confirmed, so a client-side follow-up update couldn't run yet) or
-- off (session exists immediately). The trigger fires on insert either way.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;
