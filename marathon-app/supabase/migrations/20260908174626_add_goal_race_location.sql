-- Race Day Details (PRD §6.7) needs a real lat/lon to call Open-Meteo for
-- race-day weather. No location field exists anywhere in the schema.
-- Collected explicitly via a new onboarding step + an edit-plan addition,
-- not derived from device GPS - a runner's current location and their race
-- location are frequently different cities.
-- race_location_name is a free-text human label only (e.g. "Chicago, IL")
-- for display - never geocoded. race_lat/race_lon are what the weather
-- call actually uses.
alter table public.goals add column race_lat numeric check (race_lat between -90 and 90);
alter table public.goals add column race_lon numeric check (race_lon between -180 and 180);
alter table public.goals add column race_location_name text;
