import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { PressableScale as Pressable } from "../components/ui/PressableScale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth/AuthContext";
import { supabase } from "../lib/supabase";
import { fonts, spacing, text } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { Pika } from "../components/mascot/Pika";

export default function Waitlist() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { profile, refreshProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const isRejected = profile?.status === "rejected";

  return (
    <View style={styles.screen}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 56 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Pika never appears on a "not approved" outcome - only on the friendly waiting state. */}
        {!isRejected && (
          <View style={styles.pika}>
            <Pika expression="rest" size={150} />
          </View>
        )}
        <View style={styles.card}>
          <Text style={styles.kicker}>{isRejected ? "Not approved" : "Early access"}</Text>
          <Text style={styles.title}>{isRejected ? "Access not approved" : "You're on the list."}</Text>
          <Text style={styles.body}>
            {isRejected
              ? "Your access request wasn't approved for this early-access round."
              : "We approve new runners by hand to keep the early cohort small. Pull down to check again, or just reopen the app later - you'll land straight on your plan once you're in."}
          </Text>
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}>
        <PrimaryButton label="Check again" onPress={handleRefresh} loading={refreshing} />
        <Pressable onPress={handleSignOut} hitSlop={8} accessibilityRole="button" accessibilityLabel="Sign out" style={styles.signOut}>
          <Text style={styles.signOutLabel}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    container: { flexGrow: 1, paddingHorizontal: spacing.screenPadding, paddingBottom: 16, gap: 8 },
    pika: { alignItems: "center", marginBottom: 4 },
    card: { backgroundColor: colors.cardBg, borderColor: colors.cardLine, borderWidth: 1, borderRadius: spacing.cardRadius, padding: 24, gap: 8 },
    kicker: { fontFamily: fonts.monoMedium, ...text("caption"), textTransform: "uppercase", letterSpacing: 1.5, color: colors.textDim },
    title: { fontFamily: fonts.dataBold, ...text("headline"), color: colors.textPrimary },
    body: { fontFamily: fonts.body, ...text("body"), color: colors.textDim },
    footer: { paddingHorizontal: spacing.screenPadding, paddingTop: 8, gap: 4 },
    signOut: { alignItems: "center", paddingVertical: 10 },
    signOutLabel: { fontFamily: fonts.bodyMedium, ...text("body"), color: colors.textDim },
  });
}
