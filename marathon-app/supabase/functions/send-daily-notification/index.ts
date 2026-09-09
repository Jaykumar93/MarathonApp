// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateMotivationLine } from "./llm.ts";

const SESSION_TYPE_LABEL: Record<string, string> = {
  easy: "an easy run",
  tempo: "a tempo run",
  interval: "an interval session",
  long: "a long run",
  race: "race day",
};

/** Mirrors lib/notifications/scheduleMatch.ts's isSendHourNow - see that file's own tests; Deno/Node have no shared module path in this repo, same as every other duplicated-across-functions helper here. */
function isSendHourNow(timezone: string, notificationHourLocal: number, nowUtc: Date): boolean {
  const hourInTz = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(nowUtc)
  );
  return hourInTz % 24 === notificationHourLocal;
}

/** YYYY-MM-DD for `when` as seen in `timezone` - en-CA formats that way directly. */
function dateInTimezone(when: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(when);
}

interface PlanSessionRow {
  session_type: string;
  status: string;
  planned_distance_meters: number | null;
  planned_pace_seconds_per_km: number | null;
}

function buildPrompt(fullName: string | null, today: PlanSessionRow | null, missedYesterday: boolean): { systemPrompt: string; userMessage: string } {
  const systemPrompt = `You write one short, warm, motivating good-morning notification for a runner's training app. Second person, energetic but not corny, no emoji, under 25 words, one sentence. Output ONLY the message text - no quotes, no preamble.`;

  const parts: string[] = [];
  parts.push(fullName ? `Runner's name: ${fullName}.` : `Runner's name: unknown - don't invent one, just don't use a name.`);
  if (today && today.session_type !== "rest") {
    const label = SESSION_TYPE_LABEL[today.session_type] ?? today.session_type;
    const distance = today.planned_distance_meters ? `${(today.planned_distance_meters / 1000).toFixed(1)}km` : "";
    parts.push(`Today's plan: ${label}${distance ? ` (${distance})` : ""}.`);
  } else if (today && today.session_type === "rest") {
    parts.push(`Today's plan: rest day.`);
  } else {
    parts.push(`No plan scheduled for today.`);
  }
  if (missedYesterday) parts.push(`They missed yesterday's scheduled run - acknowledge it gently, encourage getting back on track today, don't guilt-trip.`);

  return { systemPrompt, userMessage: parts.join(" ") };
}

async function sendExpoPush(messages: { to: string; title: string; body: string }[]): Promise<any[]> {
  if (messages.length === 0) return [];
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });
  const json = await res.json();
  return json?.data ?? [];
}

Deno.serve(async (req) => {
  // Deployed --no-verify-jwt (the cron trigger has no user JWT to present),
  // which means this URL is reachable by anyone who finds it - without
  // this check, a repeated call would re-evaluate every user and send
  // extra notifications (plus burn LLM API cost) beyond the real hourly
  // cron tick. The expected value is set both as this function's own
  // secret and in Supabase Vault (see the migration's cron.schedule,
  // which reads it from Vault rather than embedding it in committed SQL).
  const expectedSecret = Deno.env.get("CRON_SHARED_SECRET");
  if (!expectedSecret || req.headers.get("x-cron-secret") !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Not authorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = new Date();

    const { data: tokenRows, error: tokenError } = await supabase
      .from("push_tokens")
      .select("id, user_id, token, timezone, profiles(full_name, daily_notification_enabled, notification_hour_local)");
    if (tokenError) throw tokenError;

    const dueRows = (tokenRows ?? []).filter((row: any) => {
      const profile = row.profiles;
      if (!profile?.daily_notification_enabled) return false;
      return isSendHourNow(row.timezone, profile.notification_hour_local, now);
    });

    // One message per USER (not per token) - a user with two devices gets
    // the same line sent to both, not two independently-generated ones.
    const messageByUserId = new Map<string, string>();
    const tokensByUserId = new Map<string, { rowId: string; token: string; timezone: string }[]>();
    for (const row of dueRows as any[]) {
      const list = tokensByUserId.get(row.user_id) ?? [];
      list.push({ rowId: row.id, token: row.token, timezone: row.timezone });
      tokensByUserId.set(row.user_id, list);
    }

    for (const [userId, tokens] of tokensByUserId) {
      const timezone = tokens[0].timezone;
      const today = dateInTimezone(now, timezone);
      const yesterday = dateInTimezone(new Date(now.getTime() - 24 * 60 * 60 * 1000), timezone);

      const { data: sessions } = await supabase
        .from("plan_sessions")
        .select("session_date, session_type, status, planned_distance_meters, planned_pace_seconds_per_km")
        .eq("user_id", userId)
        .in("session_date", [today, yesterday]);

      const todaySession = (sessions ?? []).find((s: any) => s.session_date === today) ?? null;
      const yesterdaySession = (sessions ?? []).find((s: any) => s.session_date === yesterday) ?? null;
      const missedYesterday = yesterdaySession?.status === "missed";

      const row = dueRows.find((r: any) => r.user_id === userId) as any;
      const fullName = row?.profiles?.full_name ?? null;

      try {
        const { systemPrompt, userMessage } = buildPrompt(fullName, todaySession, missedYesterday);
        const message = (await generateMotivationLine(systemPrompt, userMessage)).trim();
        messageByUserId.set(userId, message || "Good morning - ready for today's run?");
      } catch (e) {
        console.error(`Motivation generation failed for user ${userId}:`, e);
        messageByUserId.set(userId, "Good morning - ready for today's run?");
      }
    }

    const pushMessages: { to: string; title: string; body: string }[] = [];
    const tokenIdByIndex: string[] = [];
    for (const [userId, tokens] of tokensByUserId) {
      const body = messageByUserId.get(userId)!;
      for (const t of tokens) {
        pushMessages.push({ to: t.token, title: "Stryde", body });
        tokenIdByIndex.push(t.rowId);
      }
    }

    const receipts = await sendExpoPush(pushMessages);
    const staleRowIds = receipts
      .map((r: any, i: number) => (r?.details?.error === "DeviceNotRegistered" ? tokenIdByIndex[i] : null))
      .filter((id: string | null): id is string => id !== null);
    if (staleRowIds.length > 0) {
      await supabase.from("push_tokens").delete().in("id", staleRowIds);
    }

    return new Response(JSON.stringify({ sent: pushMessages.length, usersMatched: tokensByUserId.size, staleTokensRemoved: staleRowIds.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    // Full detail goes to the function's own logs only - this endpoint is
    // deployed --no-verify-jwt (a cron trigger has no user JWT to present),
    // so it's reachable by anyone who finds the URL; echoing raw Postgres
    // error text back in the response would leak schema/grant details to
    // an unauthenticated caller.
    console.error("send-daily-notification failed:", e);
    return new Response(JSON.stringify({ error: "Something went wrong." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
