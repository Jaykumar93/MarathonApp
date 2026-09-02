-- Grant base table-level privileges to the authenticated role.
--
-- RLS policies only restrict *which rows* a role can see/touch — the role
-- still needs a baseline GRANT on the table before RLS is even consulted.
-- Tables created through `supabase db push` don't reliably inherit the
-- default privileges Supabase's own dashboard SQL editor sets up
-- automatically, so this has to be explicit. Found via a live RLS
-- verification test that hit "permission denied for table goals" instead
-- of an RLS violation — a different failure mode than a blocked policy.
--
-- Only `authenticated` needs access: every table in this app requires a
-- signed-in user (no anonymous features), and `service_role` already
-- bypasses RLS with its own elevated privileges.

grant usage on schema public to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.goals to authenticated;
grant select, insert, update on public.plans to authenticated;
grant select, insert, update on public.plan_sessions to authenticated;
grant select, insert, update, delete on public.shoes to authenticated;
grant select, insert, update, delete on public.activities to authenticated;
