import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { supabase } from "../supabase";

/**
 * Requests notification permission and registers this device's Expo push
 * token for the daily-notification cron job (send-daily-notification Edge
 * Function). Fire-and-forget by design (called from AuthContext right
 * after sign-in) - a denied permission or a web/simulator environment
 * should never block anything else in the app, so this only ever logs and
 * returns, never throws.
 */
export async function registerForPushNotifications(userId: string): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== "granted") {
      const { status: requested } = await Notifications.requestPermissionsAsync();
      status = requested;
    }
    if (status !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const { error } = await supabase
      .from("push_tokens")
      .upsert(
        { user_id: userId, token, platform: Platform.OS === "ios" ? "ios" : "android", timezone },
        { onConflict: "user_id,token" }
      );
    if (error) throw error;
  } catch (e) {
    console.error("registerForPushNotifications failed:", e);
  }
}
