alter table public.plan_sessions add column voice_script jsonb;

comment on column public.plan_sessions.voice_script is 'Cached AI-generated (or deterministic-fallback) run voice script - see lib/runTracking/voiceScript.ts. Generated once, lazily, on first request; never regenerated after.';
