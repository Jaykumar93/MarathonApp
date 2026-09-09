import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../lib/auth/AuthContext";
import { useNotifications } from "../lib/notifications/NotificationsContext";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from "../lib/data/notifications";
import { fonts, spacing, type } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "../components/ui/Card";

/**
 * The persistent counterpart to the daily AI motivation push - that one
 * stays OS-push-only by design, but a "you missed a run" reminder should
 * still be sitting here even if the push was dismissed or never seen.
 * Only one notification type exists today (missed_run); the list/mark-read
 * plumbing is generic on purpose so a future type (e.g. plan-adjustment
 * proposed) can reuse it without a new screen.
 */
export default function Notifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { refresh: refreshUnreadCount } = useNotifications();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    if (!session?.user?.id) return;
    getNotifications(session.user.id).then((rows) => {
      setNotifications(rows);
      setLoading(false);
    });
  }, [session?.user?.id]);

  useFocusEffect(reload);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }

  async function handlePress(notification: NotificationRow) {
    if (!notification.read) {
      await markNotificationRead(notification.id);
      setNotifications((rows) => rows.map((r) => (r.id === notification.id ? { ...r, read: true } : r)));
      refreshUnreadCount();
    }
    if (notification.plan_session_id) {
      router.push({ pathname: "/planned-session", params: { id: notification.plan_session_id } });
    }
  }

  async function handleMarkAllRead() {
    if (!session?.user?.id) return;
    await markAllNotificationsRead(session.user.id);
    setNotifications((rows) => rows.map((r) => ({ ...r, read: true })));
    refreshUnreadCount();
  }

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.container, { paddingTop: 24 + insets.top }]}>
      <View style={styles.topRow}>
        <Pressable onPress={goBack} hitSlop={10}>
          <Text style={styles.backLink}>‹ Back</Text>
        </Pressable>
        {hasUnread && (
          <Pressable onPress={handleMarkAllRead} hitSlop={10}>
            <Text style={styles.markAllLink}>Mark all read</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.header}>Notifications</Text>

      {!loading && notifications.length === 0 && (
        <Text style={styles.emptyText}>Nothing here yet - missed-run reminders will show up in this list.</Text>
      )}

      {notifications.map((notification) => (
        <Pressable key={notification.id} onPress={() => handlePress(notification)}>
          <Card style={notification.read ? styles.readCard : undefined}>
            <View style={styles.rowTop}>
              {!notification.read && <View style={styles.unreadDot} />}
              <Text style={[styles.title, notification.read && styles.readText]}>{notification.title}</Text>
            </View>
            <Text style={[styles.body, notification.read && styles.readText]}>{notification.body}</Text>
            <Text style={styles.timestamp}>{formatRelativeTime(notification.created_at)}</Text>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function formatRelativeTime(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    container: { padding: spacing.screenPadding, paddingBottom: 40 },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    backLink: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textDim },
    markAllLink: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.accent },
    header: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary, marginBottom: 18 },
    emptyText: { fontFamily: fonts.body, fontSize: type.pDim, color: colors.textFaint },
    readCard: { opacity: 0.6 },
    rowTop: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 3 },
    unreadDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.accent },
    title: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary },
    body: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textDim, lineHeight: 19 },
    readText: { color: colors.textFaint },
    timestamp: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, marginTop: 8 },
  });
}
