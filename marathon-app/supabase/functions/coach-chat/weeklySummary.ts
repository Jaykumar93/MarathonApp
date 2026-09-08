// Deno-side mirror of lib/trendsStats.ts's Monday-start weekly bucketing -
// duplicated rather than imported (same "two genuinely separate runtimes"
// reasoning as embeddings.ts) so the coach's own text answers and the
// client-rendered CoachChart bucket weeks identically. Before this, the LLM
// was handed a flat list of raw runs and asked to reason out "this week"
// itself - it used a rolling 7-day window, which silently disagreed with
// the chart's calendar-week (Monday-start) buckets, producing a reply and a
// chart that named two different numbers for the same question.

interface ActivityForSummary {
  start_time: string;
  distance_meters: number;
}

function mondayOf(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00Z");
  const dayOfWeek = d.getUTCDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * A short, explicit, pre-computed weekly mileage table - the same
 * Monday-start buckets CoachChart draws from lib/trendsStats.ts. Handed to
 * the LLM as facts to quote, not raw data to re-derive, so "this week" in
 * the reply always means the exact same date range as the chart under it.
 */
export function buildWeeklySummaryText(activities: ActivityForSummary[], todayIso: string, weeks = 4): string {
  const currentWeekStart = mondayOf(todayIso);
  const firstWeekStart = addDays(currentWeekStart, -7 * (weeks - 1));

  const kmByWeek = new Map<string, number>();
  const countByWeek = new Map<string, number>();
  for (const a of activities) {
    const date = a.start_time.slice(0, 10);
    const weekStart = mondayOf(date);
    if (weekStart < firstWeekStart || weekStart > currentWeekStart) continue;
    kmByWeek.set(weekStart, (kmByWeek.get(weekStart) ?? 0) + a.distance_meters / 1000);
    countByWeek.set(weekStart, (countByWeek.get(weekStart) ?? 0) + 1);
  }

  const lines: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStartIso = addDays(currentWeekStart, -7 * i);
    const km = kmByWeek.get(weekStartIso) ?? 0;
    const count = countByWeek.get(weekStartIso) ?? 0;
    const label = i === 0 ? `Week of ${weekStartIso} (this week, Monday through today)` : `Week of ${weekStartIso}`;
    lines.push(`${label}: ${km.toFixed(1)} km over ${count} run${count === 1 ? "" : "s"}`);
  }
  return lines.join("\n");
}
