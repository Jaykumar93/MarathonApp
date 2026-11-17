import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Remembers how many seconds/km of pace nudge the runner has already accepted for
 * a session type in a plan, so suggestPaceNudge's cap holds across runs. Kept on
 * the device (the same place pending runs live); if it is lost the worst case is
 * one more small, opt-in suggestion - never an automatic change.
 */
const key = (planId: string, sessionType: string) => `cursus:nudges:${planId}:${sessionType}`;

export async function getNudgedSeconds(planId: string, sessionType: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(key(planId, sessionType));
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function addNudgedSeconds(planId: string, sessionType: string, seconds: number): Promise<void> {
  try {
    const current = await getNudgedSeconds(planId, sessionType);
    await AsyncStorage.setItem(key(planId, sessionType), String(current + Math.abs(seconds)));
  } catch {
    // best effort: the cap is a safety net, not a data record
  }
}
