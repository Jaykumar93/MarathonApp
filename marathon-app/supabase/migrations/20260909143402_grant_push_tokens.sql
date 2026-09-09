-- Same lesson as 20260902221645_grants.sql and 20260908130000_grant_service_role_knowledge_base.sql:
-- a table created through `supabase db push` doesn't reliably inherit the
-- default privileges Supabase's own dashboard SQL editor sets up
-- automatically - RLS policies are only consulted after the base table
-- GRANT already passes, so push_tokens needed this from the start. Caught
-- immediately by manually invoking send-daily-notification right after
-- deploying it ("permission denied for table push_tokens" from
-- service_role, not an RLS violation).

grant select, insert, delete on public.push_tokens to authenticated;
grant select, delete on public.push_tokens to service_role;
