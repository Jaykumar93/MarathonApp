-- Voice coaching during a GPS run (Task 6): announces distance/time/pace at
-- a configurable interval, plus start/pause/resume/finish cues. A profile-
-- level preference (not a local device setting) so it's consistent with
-- every other run/display preference (distance_unit, theme_preference)
-- already stored here rather than in AsyncStorage.
alter table public.profiles
  add column voice_coaching_enabled boolean not null default false,
  add column voice_announcement_interval_km numeric not null default 1 check (voice_announcement_interval_km > 0);

comment on column public.profiles.voice_announcement_interval_km is 'How often (km) the voice cue announces distance/time/pace during a tracked run - e.g. 1 for every km, 5 for every 5km. Always stored in km regardless of the user''s distance_unit display preference, same as every other distance column in this schema.';
