/**
 * Pure reference implementation for "is it this user's notification hour,
 * right now, in their own timezone" - the actual send-decision the
 * send-daily-notification Edge Function makes for every push_tokens row on
 * each hourly cron tick. Mirrored (not imported - Deno/Node are separate
 * runtimes with no shared module path in this repo, same as every other
 * Edge Function here) inline in that function's index.ts; kept here, and
 * kept correct via this test suite, as the reference both should match.
 *
 * The client itself never calls this - it only stores the preferred hour
 * (Settings) and lets the server-side cron decide when to fire.
 */
export function isSendHourNow(timezone: string, notificationHourLocal: number, nowUtc: Date = new Date()): boolean {
  // Intl.DateTimeFormat with hour12:false can format midnight as "24" in
  // some environments - normalized back into 0-23 rather than trusting it
  // matches the 0-23 range notification_hour_local is stored in.
  const hourInTz = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(nowUtc)
  );
  return hourInTz % 24 === notificationHourLocal;
}
