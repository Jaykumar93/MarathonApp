import { getLastSyncedActivityTime, importSyncedActivity } from "../data/activities";
import type { HealthDataProvider } from "./HealthDataProvider";

// First-ever sync for a newly connected account has no prior activity to
// anchor "since" to - 30 days back is a reasonable initial backfill window
// (a full training block's worth of recent runs) without silently pulling
// in someone's entire multi-year Health Connect history.
const INITIAL_BACKFILL_DAYS = 30;

export interface HealthSyncResult {
  imported: number;
  skipped: number;
}

/**
 * Pulls whatever a provider has since the last activity synced from it (or
 * the initial backfill window, on a first connect) and writes each one in.
 * De-duplication is the DB's own job (activities_source_external_id_uidx) -
 * importSyncedActivity reports back what actually happened so this can
 * return an honest count, but doesn't need to pre-filter anything itself.
 */
export async function syncHealthActivities(userId: string, provider: HealthDataProvider): Promise<HealthSyncResult> {
  const lastSynced = await getLastSyncedActivityTime(userId, provider.source);
  const sinceIso = lastSynced ?? new Date(Date.now() - INITIAL_BACKFILL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const samples = await provider.getRecentActivities(sinceIso);

  let imported = 0;
  let skipped = 0;
  for (const sample of samples) {
    const wasImported = await importSyncedActivity(userId, {
      source: provider.source,
      externalId: sample.externalId,
      activityType: sample.activityType,
      startTimeIso: sample.startTimeIso,
      distanceMeters: sample.distanceMeters,
      durationSeconds: sample.durationSeconds,
      avgHeartRate: sample.avgHeartRate,
      calories: sample.calories,
    });
    if (wasImported) imported++;
    else skipped++;
  }
  return { imported, skipped };
}
