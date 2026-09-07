import type { HealthDataProvider } from "./HealthDataProvider";

/**
 * react-native-health-connect's native module binding throws at import time
 * on web (TurboModuleRegistry.getEnforcing runs eagerly, not lazily - same
 * class of issue as RunMap.web.tsx's react-native-maps workaround, confirmed
 * against this project's own web preview). Metro picks this file over
 * healthConnectProvider.ts automatically for a web bundle; Android still
 * gets the real implementation. isAvailable() already reports false here,
 * same as it always did off-Android, so no call site needs to know which
 * file actually loaded.
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
