export type DistanceUnit = "km" | "mi";

const KM_TO_MI = 0.621371;

/** Formats a km value in the given display unit, e.g. "5.0km" or "3.1mi". */
export function formatDistance(km: number, unit: DistanceUnit): string {
  if (unit === "mi") return `${(km * KM_TO_MI).toFixed(1)}mi`;
  return `${km.toFixed(1)}km`;
}

/** Pace stored as sec/km everywhere - converts for display only. */
export function formatPace(secondsPerKm: number | null, unit: DistanceUnit): string {
  if (!secondsPerKm) return "";
  const secondsPerUnit = unit === "mi" ? secondsPerKm / KM_TO_MI : secondsPerKm;
  const mins = Math.floor(secondsPerUnit / 60);
  const secs = Math.round(secondsPerUnit % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/${unit}`;
}
