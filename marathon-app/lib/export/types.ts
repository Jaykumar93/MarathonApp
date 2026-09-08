/**
 * Narrow, export-specific view of an activity - not the full ActivityRow,
 * same "no data-layer coupling" convention as lib/activityStats.ts's
 * ActivityForStats. GPX/TCX serialization only ever needs these fields.
 */
export interface ExportActivity {
  name: string | null;
  activityType: string;
  startTime: string; // ISO timestamp (activities.start_time)
  distanceMeters: number;
  durationSeconds: number;
}
