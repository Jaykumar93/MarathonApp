-- Optional public-facing username, separate from full_name (display name,
-- editable freely) and email (login identity, changed only via Supabase
-- Auth). Nullable + unique so existing users aren't forced to pick one;
-- format-constrained (lowercase, 3-20 chars, letters/digits/underscore)
-- so it's safe to surface anywhere a handle might be shown later.
alter table public.profiles
  add column username text unique check (username ~ '^[a-z0-9_]{3,20}$');
