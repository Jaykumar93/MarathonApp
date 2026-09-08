-- Groups coach_messages into distinct conversations, so "New chat" can start
-- a genuinely fresh thread while every past one stays browsable in a
-- history list instead of being deleted or lost in one giant continuous
-- scroll. No RLS/grant changes needed - conversation_id is just a plain
-- column on a table already fully covered by coach_messages' existing
-- policies and grants (both apply table-wide, not per-column).

alter table public.coach_messages add column conversation_id uuid;

-- Backfill: bucket all pre-existing history into one shared conversation
-- rather than fragmenting every past row into its own single-message
-- "conversation" - a real user may already have a real short thread there.
update public.coach_messages set conversation_id = '00000000-0000-0000-0000-000000000000'::uuid where conversation_id is null;

alter table public.coach_messages alter column conversation_id set not null;
alter table public.coach_messages alter column conversation_id set default gen_random_uuid();

create index coach_messages_user_id_conversation_id_idx on public.coach_messages (user_id, conversation_id, created_at);
