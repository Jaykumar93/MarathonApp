-- Architecture pass: full-text search replaces the unconditional Hugging
-- Face embedding call as the hot-path way to match a question against the
-- knowledge base. That HF call, on every single coach message, was
-- identified (independently, by a from-scratch architecture review) as the
-- likely dominant source of latency - a synchronous dependency on a free
-- inference tier with uncontrolled cold-start behavior, paid on 100% of
-- requests to search a corpus of only 5 articles that doesn't need
-- semantic recall at this size. The existing `embedding` column and
-- match_knowledge_base() RPC are left completely untouched - not dropped,
-- just taken off the hot path - as a fallback route if the corpus grows
-- enough later that lexical matching starts missing things a real
-- semantic search would have caught.

alter table public.knowledge_base
  add column search_vector tsvector generated always as (to_tsvector('english', title || ' ' || content)) stored;

create index knowledge_base_search_vector_idx on public.knowledge_base using gin (search_vector);

-- websearch_to_tsquery tolerates plain natural-language input (the runner's
-- actual question) without raising on stray punctuation, unlike
-- plainto_tsquery/to_tsquery - closer to how a search box behaves than a
-- strict query-syntax parser.
create or replace function public.match_knowledge_base_fts(query_text text, match_count int default 3)
returns table (id uuid, title text, content text, rank real)
language sql stable
as $$
  select id, title, content, ts_rank(search_vector, websearch_to_tsquery('english', query_text)) as rank
  from public.knowledge_base
  where search_vector @@ websearch_to_tsquery('english', query_text)
  order by rank desc
  limit match_count;
$$;

grant execute on function public.match_knowledge_base_fts(text, int) to authenticated;
