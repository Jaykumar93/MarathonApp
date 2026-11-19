/** "Mon 23 Nov" from an ISO date (UTC, so the weekday never shifts with the viewer's time zone). */
export function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${weekday} ${d.getUTCDate()} ${month}`;
}
