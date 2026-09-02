-- Add 'race' as a valid plan_sessions.session_type.
--
-- Found while designing the plan-generator engine (Task 3): race day itself
-- (the session on goal_date) is a genuinely distinct feature — a readiness
-- summary, a pre-filled pace band, and a morning-of checklist (PRD §6.7),
-- not just another 'long' run. Without this, the goal-date session would
-- have to be mislabeled as 'long', losing that distinction.

alter table public.plan_sessions
  drop constraint plan_sessions_session_type_check;

alter table public.plan_sessions
  add constraint plan_sessions_session_type_check
  check (session_type in ('easy', 'tempo', 'long', 'interval', 'rest', 'race'));
