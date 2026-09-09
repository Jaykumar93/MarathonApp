import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { fonts } from "../lib/theme";
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
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
    >
      <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    button: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
    badge: {
      position: "absolute",
      top: -2,
      right: -4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 3,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { fontFamily: fonts.bodyBold, fontSize: 10, color: "#fff" },
  });
}
