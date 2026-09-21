import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth/AuthContext";
import { useNotifications } from "../lib/notifications/NotificationsContext";
import { NOTIFICATION_ICON } from "../lib/notifications/notificationVisuals";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from "../lib/data/notifications";
import { fonts, spacing, type } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "../components/ui/Card";

type Group = "Today" | "This week" | "Earlier";
const GROUP_ORDER: Group[] = ["Today", "This week", "Earlier"];

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
  const grouped = useMemo(() => groupByRecency(notifications), [notifications]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.container, { paddingTop: 24 + insets.top }]}>
      <View style={styles.topRow}>
        <Pressable onPress={goBack} hitSlop={10}>
          <Text style={styles.backLink}>‹ Back</Text>
        </Pressable>
        {hasUnread && (
          <Pressable onPress={handleMarkAllRead} hitSlop={10} style={styles.markPill}>
            <Text style={styles.markPillText}>Mark all read</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.header}>Notifications</Text>

      {!loading && notifications.length === 0 && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="notifications-outline" size={22} color={colors.textFaint} />
          </View>
          <Text style={styles.emptyTitle}>You're all caught up</Text>
          <Text style={styles.emptySub}>Missed-run reminders will show up here.</Text>
        </View>
      )}

      {GROUP_ORDER.filter((g) => grouped[g].length > 0).map((group) => (
        <View key={group}>
          <Text style={styles.groupLabel}>{group}</Text>
          {grouped[group].map((notification) => (
            <Pressable key={notification.id} onPress={() => handlePress(notification)}>
              <Card
                style={{
                  ...styles.card,
                  ...(!notification.read ? styles.unreadCard : null),
                  ...(notification.read ? styles.readCard : null),
                }}
              >
                {!notification.read && <View style={styles.unreadBar} />}
                <View style={styles.iconWrap}>
                  <Ionicons name={NOTIFICATION_ICON[notification.type]} size={17} color={colors.warningText} />
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.title, notification.read && styles.readText]}>{notification.title}</Text>
                    <Text style={styles.timestamp}>{formatRelativeTime(notification.created_at)}</Text>
                  </View>
                  <Text style={[styles.body, notification.read && styles.readText]}>{notification.body}</Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function groupByRecency(rows: NotificationRow[]): Record<Group, NotificationRow[]> {
  const groups: Record<Group, NotificationRow[]> = { Today: [], "This week": [], Earlier: [] };
  for (const row of rows) {
    const diffDays = Math.floor((Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) groups.Today.push(row);
    else if (diffDays <= 7) groups["This week"].push(row);
    else groups.Earlier.push(row);
  }
  return groups;
}

function formatRelativeTime(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    container: { padding: spacing.screenPadding, paddingBottom: 40 },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    backLink: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textDim },
    markPill: {
      backgroundColor: `${colors.accent}1A`,
      borderWidth: 1,
      borderColor: `${colors.accent}40`,
      borderRadius: 100,
      paddingVertical: 5,
      paddingHorizontal: 11,
    },
    markPillText: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, color: colors.accent },
    header: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary, marginBottom: 18 },
    emptyState: { alignItems: "center", paddingTop: 50, gap: 10 },
    emptyIconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.cardLine,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textPrimary },
    emptySub: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, textAlign: "center" },
    groupLabel: {
      fontFamily: fonts.mono,
      fontSize: type.sectionLabel,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: colors.textFaint,
      marginTop: 16,
      marginBottom: 8,
    },
    card: { flexDirection: "row", gap: 11, alignItems: "flex-start" },
    unreadCard: { backgroundColor: colors.warningBg },
    readCard: { opacity: 0.55 },
    unreadBar: {
      position: "absolute",
      left: 0,
      top: 10,
      bottom: 10,
      width: 3,
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: `${colors.warning}1F`,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    cardBody: { flex: 1 },
    rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 2 },
    title: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.textPrimary, flexShrink: 1 },
    timestamp: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.textFaint, flexShrink: 0 },
    body: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textDim, lineHeight: 19 },
    readText: { color: colors.textFaint },
  });
}
