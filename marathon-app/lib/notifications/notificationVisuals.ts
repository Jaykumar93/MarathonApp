import type { Ionicons } from "@expo/vector-icons";
import type { NotificationType } from "../data/notifications";

/**
 * Icon per notification type, keyed the same way NotificationRow.type already
 * is - only missed_run exists today, but the list screen and this map are
 * both written to add a new type without touching the other (see
 * NotificationsContext.tsx's own comment about staying generic).
 */
export const NOTIFICATION_ICON: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  missed_run: "alert-circle-outline",
};
