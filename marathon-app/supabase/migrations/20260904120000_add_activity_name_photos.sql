-- Activity name (free text, shown alongside the existing session_type
-- label rather than replacing it) and up to 3 attached photos. `notes`
-- already exists and doubles as the "description" field - no new column
-- needed for that.
alter table public.activities
  add column name text,
  add column photo_urls jsonb;

comment on column public.activities.photo_urls is 'Array of public Storage URLs (activity-photos bucket), max 3 - enforced in app code, not a DB constraint.';

-- Public-read bucket: running photos aren't sensitive the way training
-- plans/goals are, and a public bucket means the stored URL works
-- directly everywhere (share cards, detail screens) with no signed-URL
-- refresh logic. Write access is still locked down below to each user's
-- own folder, same ownership model as every other table's RLS.
insert into storage.buckets (id, name, public)
values ('activity-photos', 'activity-photos', true)
on conflict (id) do nothing;

create policy "activity-photos: public read"
  on storage.objects for select
  using (bucket_id = 'activity-photos');

-- Objects must be uploaded under a path starting with the uploader's own
-- user id (e.g. `{user_id}/{activity_id}/{filename}`) - storage.objects
-- has no user_id column of its own, so ownership is enforced via the
-- path's first folder segment instead, the standard Supabase Storage
-- pattern for per-user file scoping.
create policy "activity-photos: insert own"
  on storage.objects for insert
  with check (bucket_id = 'activity-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "activity-photos: delete own"
  on storage.objects for delete
  using (bucket_id = 'activity-photos' and (storage.foldername(name))[1] = auth.uid()::text);
