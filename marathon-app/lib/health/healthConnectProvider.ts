import type { HealthDataProvider } from "./HealthDataProvider";

/**
 * Deliberately a stub, not a mock of real Health Connect behavior - it
 * exists so HealthDataProvider has one real conformer and every call site
 * (onboarding, Settings) is already wired against the interface, not so
 * anything here simulates what a real sync would return. The actual
 * `react-native-health-connect`-backed implementation is blocked on a
 * custom dev build existing (it cannot run in Expo Go at all - confirmed
 * against the library's own docs before this was written, same diligence
 * Task 6 applied to react-native-maps) - see
 * docs/plan/07-health-connect-sync.md for the full scope note. Swapping
 * this file's body for a real implementation is the only change needed
 * once that build exists.
 */
export const healthConnectProvider: HealthDataProvider = {
  source: "health_connect",

  async isAvailable() {
    return false;
  },

  async requestPermissions() {
    return false;
  },

  async getRecentActivities() {
    return [];
  },
};
