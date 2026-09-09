-- Same lesson again (see 20260909143402_grant_push_tokens.sql and the two
-- migrations it references): service_role never actually had baseline
-- SELECT on profiles or plan_sessions in this project - every prior
-- service-role use (admin-set-approval) only ever did a targeted UPDATE
-- by id, which happened not to surface this gap. send-daily-notification
-- is the first service-role caller that needs to SELECT across both
-- tables (an embedded push_tokens->profiles join, plus a direct
-- plan_sessions query), and hit "permission denied for table profiles"
-- immediately on first real invocation.

grant select on public.profiles to service_role;
grant select on public.plan_sessions to service_role;
