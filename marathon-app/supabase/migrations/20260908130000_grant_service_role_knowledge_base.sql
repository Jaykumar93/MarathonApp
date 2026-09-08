-- Same lesson as 20260902221645_grants.sql, this time hit by service_role
-- rather than authenticated: a table created through `supabase db push`
-- doesn't reliably inherit the elevated privileges service_role normally
-- gets automatically on a table created through Supabase's own dashboard
-- SQL editor. scripts/seedKnowledgeBase.ts (using the service_role key
-- specifically because authenticated users can't write knowledge_base at
-- all) hit "permission denied for table knowledge_base" on its very first
-- run - RLS bypass and baseline table GRANTs are two separate Postgres
-- privilege layers, and service_role needs both, not just the first one.

grant select, insert, delete on public.knowledge_base to service_role;
