/**
 * Moving a session to another day in the same week: which days are offered, and a warning when the
 * swap would break the spacing the plan was built with (a hard session right next to the long run or
 * to another hard session). Pure, so the rules are testable.
 */

export interface SwapSession {
  id: string;
  session_date: string;
  session_type: string;
  status: string;
}

const HARD = new Set(["tempo", "interval"]);

const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** The Monday of the week an ISO date is in. */
export function weekStart(iso: string): string {
  const day = new Date(iso + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

/**
 * The days a session can be moved to: the rest of its own Monday to Sunday week, from today on,
 * excluding sessions already finished and race day. Each is a swap with whatever is on that day.
 */
export function swapTargets<S extends SwapSession>(session: SwapSession, planSessions: S[], today: string): S[] {
  const monday = weekStart(session.session_date);
  const sunday = addDays(monday, 6);
  return planSessions
    .filter(
      (s) =>
        s.id !== session.id &&
        s.session_date >= monday &&
        s.session_date <= sunday &&
        s.session_date >= today &&
        s.status !== "completed" &&
        s.session_type !== "race"
    )
    .sort((a, b) => a.session_date.localeCompare(b.session_date));
}

/**
 * What is wrong with the week if `session` and `other` swap days, or null if nothing is. Looks at
 * every day next to the two that change: a hard session beside another hard session, or a hard
 * session the day before the long run (the day after one is also hard on tired legs, so it counts too).
 */
export function swapWarning(session: SwapSession, other: SwapSession, planSessions: SwapSession[]): string | null {
  const typeOn = new Map<string, string>();
  for (const s of planSessions) typeOn.set(s.session_date, s.session_type);
  typeOn.set(other.session_date, session.session_type);
  typeOn.set(session.session_date, other.session_type);

  const touched = [session.session_date, other.session_date];
  for (const date of touched) {
    const type = typeOn.get(date);
    if (!type) continue;
    for (const neighbourDate of [addDays(date, -1), addDays(date, 1)]) {
      const neighbour = typeOn.get(neighbourDate);
      if (!neighbour) continue;
      if (HARD.has(type) && HARD.has(neighbour)) return "That puts two hard sessions on back-to-back days.";
      if (type === "long" && HARD.has(neighbour)) return "That puts a hard session right next to your long run.";
      if (HARD.has(type) && neighbour === "long") return "That puts a hard session right next to your long run.";
    }
  }
  return null;
}
