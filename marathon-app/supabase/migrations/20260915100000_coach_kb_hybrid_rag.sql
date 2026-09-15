-- Hybrid RAG pass: pairs the existing full-text search with real vector
-- similarity search via Reciprocal Rank Fusion, instead of relying on
-- lexical matching alone. The old embedding column (Hugging Face
-- sentence-transformers/all-MiniLM-L6-v2, 384 dims) is replaced rather than
-- kept alongside a second one - a different embedding model/dimension count
-- can't share a column, and there's no reason to carry two generations of
-- embeddings for the same handful of articles once every row gets
-- re-seeded anyway.
--
-- New embeddings come from Gemini's gemini-embedding-001 (text-only,
-- GA/stable - not gemini-embedding-2-preview, which is multimodal and
-- still in preview) truncated to 768 dimensions, the size Google's own
-- docs recommend for most applications - reusing the same provider/API key
-- coach-chat's LLM calls already use rather than adding a second vendor
-- dependency back in. Verified live against Google's own cookbook example
-- (github.com/google-gemini/cookbook) rather than guessed, since this
-- model lineup moves fast enough that a stale guess was a real risk.

alter table public.knowledge_base drop column embedding;
alter table public.knowledge_base add column embedding vector(768);

drop function if exists public.match_knowledge_base(vector, int);

-- HNSW over ivfflat - builds cleanly on a tiny/empty table (ivfflat's
-- cluster quality depends on real data already being present at CREATE
-- INDEX time, which doesn't fit this table's truncate-and-reseed workflow)
-- and this corpus is intentionally small enough that neither index is
-- actually needed for query speed today - this is here for when the
-- corpus grows, not because 5 rows need it right now.
create index knowledge_base_embedding_idx on public.knowledge_base
  using hnsw (embedding vector_cosine_ops);

-- Combines the existing lexical match (search_vector, see the prior
-- migration) with real semantic similarity via Reciprocal Rank Fusion -
-- score = sum of 1/(60+rank) across whichever list(s) a row appears in,
-- k=60 is the standard constant from the original RRF paper and
-- Elasticsearch's own default - rather than picking one or the other.
-- Lexical search catches exact-term matches semantic search can
-- under-rank; semantic search catches conceptually-related content worded
-- differently than the question, which lexical matching misses entirely.
-- query_embedding is nullable so a failed/unavailable embedding call
-- degrades this to lexical-only instead of failing the whole request - see
-- coach-chat's embeddings.ts.
create or replace function public.match_knowledge_base_hybrid(
  query_text text,
  query_embedding vector(768) default null,
  match_count int default 3
)
returns table (id uuid, title text, content text, rank real)
language sql stable
as $$
  with fts as (
    select kb.id,
           row_number() over (order by ts_rank(kb.search_vector, websearch_to_tsquery('english', query_text)) desc) as rnk
    from public.knowledge_base kb
    where kb.search_vector @@ websearch_to_tsquery('english', query_text)
    order by ts_rank(kb.search_vector, websearch_to_tsquery('english', query_text)) desc
    limit match_count * 4
  ),
  vec as (
    select kb.id,
           row_number() over (order by kb.embedding <=> query_embedding) as rnk
    from public.knowledge_base kb
    where query_embedding is not null
    order by kb.embedding <=> query_embedding
    limit match_count * 4
  ),
  combined as (
    select coalesce(fts.id, vec.id) as id,
           coalesce(1.0 / (60 + fts.rnk), 0) + coalesce(1.0 / (60 + vec.rnk), 0) as score
    from fts
    full outer join vec on fts.id = vec.id
  )
  select kb.id, kb.title, kb.content, c.score::real as rank
  from combined c
  join public.knowledge_base kb on kb.id = c.id
  order by c.score desc
  limit match_count;
$$;

grant execute on function public.match_knowledge_base_hybrid(text, vector, int) to authenticated;
