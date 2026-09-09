-- Google OAuth signups never carry a `username` in raw_user_meta_data (only
-- our own sign-up form's metadata does), so with `username` now NOT NULL,
-- an OAuth-created row would fail the trigger insert outright. Fall back to
-- the same random-username scheme used for the pre-mandatory-username
-- backfill. Also coalesce full_name with Google's `name` field, since
-- Google's metadata uses `name` rather than `full_name`.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'username', 'user' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  );
  return new;
end;
$$;
