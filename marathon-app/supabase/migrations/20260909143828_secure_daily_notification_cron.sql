-- send-daily-notification is deployed --no-verify-jwt (a cron trigger has
-- no user JWT to present), which means the URL is callable by anyone who
-- finds it. Re-schedules the same job (cron.schedule with an existing job
-- name updates it in place) to send a shared-secret header, checked by the
-- function itself. The secret's actual value lives only in Supabase Vault
-- (created via a one-off `supabase db query`, not in any committed
-- migration) and as this function's own CRON_SHARED_SECRET secret -
-- referenced here by name only, never embedded in this file.
select cron.schedule(
  'send-daily-notification-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://lvjpgqhwsseqwbmexres.supabase.co/functions/v1/send-daily-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
