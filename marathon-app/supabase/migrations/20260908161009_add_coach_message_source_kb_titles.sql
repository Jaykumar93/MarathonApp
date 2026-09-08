-- coach_messages already stored source_kb_ids (article ids), but the app
-- had no way to turn those back into titles when loading history - only a
-- live reply (which gets titles straight from the Edge Function's own
-- response) could show a "reference chip" for the knowledge-base articles
-- it drew on. Reloading any past conversation silently dropped every KB
-- citation. Denormalizing the titles alongside the ids avoids needing a
-- join in the app just to resolve them back.
alter table public.coach_messages add column source_kb_titles text[];
