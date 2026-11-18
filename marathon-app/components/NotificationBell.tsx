import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PressableScale as Pressable } from "./ui/PressableScale";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { fonts, text, radius, palette } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { useNotifications } from "../lib/notifications/NotificationsContext";

export function NotificationBell() {
  const router = useRouter();
  const { colors } = useTheme();
  const { unreadCount } = useNotifications();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      style={styles.button}
      onPress={() => router.push("/notifications")}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
    >
      <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText} maxFontSizeMultiplier={1.1}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    button: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    badge: {
      position: "absolute",
      top: 4,
      right: 2,
      minWidth: 16,
      height: 16,
      borderRadius: radius.pill,
      paddingHorizontal: 3,
      backgroundColor: colors.accentFill,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { fontFamily: fonts.bodyBold, ...text("micro"), color: palette.onAccent },
  });
}
