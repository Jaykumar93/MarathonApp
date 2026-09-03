import AsyncStorage from "@react-native-async-storage/async-storage";
import { createActivity, type CreateActivityInput } from "./activities";

const STORAGE_KEY = "stryde:pendingActivities";

interface PendingActivity {
  id: string;
  userId: string;
  input: CreateActivityInput;
  queuedAt: string;
}

async function readQueue(): Promise<PendingActivity[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingActivity[];
  } catch {
    return [];
  }
}

async function writeQueue(queue: PendingActivity[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

/**
 * A GPS run must never be lost just because Stop happened offline (PRD
 * §6.5's "queue locally and sync once reconnected"). Called only when the
 * immediate createActivity() attempt in active-run.tsx already failed.
 */
export async function savePendingActivity(userId: string, input: CreateActivityInput): Promise<void> {
  const queue = await readQueue();
  queue.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, userId, input, queuedAt: new Date().toISOString() });
  await writeQueue(queue);
}

export async function getPendingActivityCount(): Promise<number> {
  return (await readQueue()).length;
}

/**
 * Retries every queued activity for this user, removing each on success and
 * leaving the rest queued on failure (still offline, or a genuinely bad
 * request) - called when the Track tab gains focus, a natural "the user is
 * back in the app, maybe back online too" moment, rather than polling in
 * the background.
 */
export async function flushPendingActivities(userId: string): Promise<{ synced: number; remaining: number }> {
  const queue = await readQueue();
  const stillPending: PendingActivity[] = [];
  let synced = 0;

  for (const pending of queue) {
    if (pending.userId !== userId) {
      stillPending.push(pending);
      continue;
    }
    try {
      await createActivity(pending.userId, pending.input);
      synced++;
    } catch {
      stillPending.push(pending);
    }
  }

  await writeQueue(stillPending);
  return { synced, remaining: stillPending.length };
}
