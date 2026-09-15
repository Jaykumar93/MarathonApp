-- Debug/observability column: which LLM provider actually answered this
-- turn ("gemini" or "groq"). Added specifically to diagnose a latency
-- report where even a single-tool-call-free question felt slow - without
-- this, there was no way to tell "Gemini is just slow today" apart from
-- "Gemini is silently erroring and every reply is paying for a full failed
-- Gemini attempt plus a full Groq attempt" from outside the Edge Function
-- logs, which aren't queryable from this project's current Supabase CLI
-- version. Nullable, no backfill - only coach-chat's own inserts populate
-- it going forward.

alter table public.coach_messages add column provider text;
