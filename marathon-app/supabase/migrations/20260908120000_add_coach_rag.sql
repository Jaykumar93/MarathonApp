-- Task 8 Phase C: AI Coach (RAG) - knowledge_base + coach_messages.
--
-- Deliberately deferred out of the initial schema (see that migration's own
-- header comment) until the embedding model was picked: Hugging Face's
-- sentence-transformers/all-MiniLM-L6-v2, 384 dimensions.

create extension if not exists vector;

-- ============================================================
-- knowledge_base
-- ============================================================
-- Global, read-only to every authenticated user - a small set of
-- self-authored sports-science articles (pacing, fueling, injury
-- prevention, tapering, recovery), never scraped, per the PRD's own
-- decision log. Seeded by scripts/seedKnowledgeBase.ts using the
-- service_role key, which bypasses RLS - that script is the only writer.

create table public.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  embedding vector(384) not null,
  created_at timestamptz not null default now()
);

alter table public.knowledge_base enable row level security;

create policy "knowledge_base: read all" on public.knowledge_base
  for select using (auth.role() = 'authenticated');

comment on table public.knowledge_base is 'No insert/update/delete policy for authenticated users on purpose - only the service-role seed script can write this. No IVFFlat/HNSW index either - this table only ever holds a handful of articles, where a sequential scan is faster than a similarity index tuned for a much larger corpus.';

-- Cosine-similarity top-N lookup, called by the coach-chat Edge Function
-- via supabase.rpc() using the caller's own (authenticated) JWT - stable/sql
-- so it can be planned like any other read, and readable under the same
-- "authenticated" grant as the table itself.
create or replace function public.match_knowledge_base(query_embedding vector(384), match_count int default 4)
returns table (id uuid, title text, content text, similarity float)
language sql stable
as $$
  select id, title, content, 1 - (embedding <=> query_embedding) as similarity
  from public.knowledge_base
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- coach_messages
-- ============================================================
-- Per-user chat history - same auth.uid() = user_id RLS shape as every
-- other per-user table. Immutable once written (no update/delete policy),
-- same "no raw delete exposed" precedent as goals/plans/plan_sessions.

create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- What this message was actually asked about, if it came from an "Ask
  -- Coach" entry point rather than the open chat screen.
  activity_id uuid references public.activities (id) on delete set null,
  plan_session_id uuid references public.plan_sessions (id) on delete set null,
  -- Populated on assistant rows only - which activities/KB articles this
  -- specific reply actually drew on, for the chat UI's reference chips.
  source_activity_ids uuid[],
  source_kb_ids uuid[],
  created_at timestamptz not null default now()
);

comment on table public.coach_messages is 'activity_id/plan_session_id are ownership-checked against user_id by enforce_coach_message_links_owner, same pattern as activities/plan_sessions - RLS alone only checks user_id=auth.uid(), it does not verify these cross-links point at the same user''s own rows.';

alter table public.coach_messages enable row level security;

create policy "coach_messages: select own" on public.coach_messages
  for select using (auth.uid() = user_id);

create policy "coach_messages: insert own" on public.coach_messages
  for insert with check (auth.uid() = user_id);

create index coach_messages_user_id_created_at_idx on public.coach_messages (user_id, created_at);

create function public.enforce_coach_message_links_owner()
returns trigger
language plpgsql
as $$
declare
  owner uuid;
begin
  if new.activity_id is not null then
    select user_id into owner from public.activities where id = new.activity_id;
    if owner is null or owner <> new.user_id then
      raise exception 'coach_messages.activity_id must belong to the same user';
    end if;
  end if;

  if new.plan_session_id is not null then
    select user_id into owner from public.plan_sessions where id = new.plan_session_id;
    if owner is null or owner <> new.user_id then
      raise exception 'coach_messages.plan_session_id must belong to the same user';
    end if;
  end if;

  return new;
end;
$$;

create trigger coach_messages_enforce_links_owner
  before insert or update on public.coach_messages
  for each row execute function public.enforce_coach_message_links_owner();

-- ============================================================
-- grants
-- ============================================================
-- Same lesson as 20260902221645_grants.sql: RLS only restricts which rows
-- a role can see, the role still needs a baseline table-level GRANT first,
-- and tables created through `supabase db push` don't reliably inherit
-- that automatically.

grant select on public.knowledge_base to authenticated;
grant select, insert on public.coach_messages to authenticated;
grant execute on function public.match_knowledge_base(vector, int) to authenticated;
