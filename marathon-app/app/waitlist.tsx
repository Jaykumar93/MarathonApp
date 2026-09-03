import React, { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../lib/auth/AuthContext";
import { supabase } from "../lib/supabase";
import { colors, fonts, spacing } from "../lib/theme";
import { PrimaryButton } from "../components/ui/PrimaryButton";

export default function Waitlist() {
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
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <Text style={styles.badge}>{isRejected ? "Not approved" : "Waitlist"}</Text>
      <Text style={styles.title}>{isRejected ? "Access not approved" : "You're on the list"}</Text>
      <Text style={styles.body}>
        {isRejected
          ? "Your access request wasn't approved for this early-access round."
          : "Access is approved manually as the early-access group grows. Pull down to check again, or just reopen the app later - you'll land straight on your plan once you're approved."}
      </Text>
      <View style={styles.actions}>
        <PrimaryButton label="Check again" onPress={handleRefresh} loading={refreshing} variant="secondary" />
        <PrimaryButton label="Sign out" onPress={handleSignOut} variant="secondary" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: spacing.screenPadding, gap: 14, backgroundColor: colors.screenBg },
  badge: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.warning,
  },
  title: { fontFamily: fonts.dataBold, fontSize: 26, color: colors.textPrimary },
  body: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: colors.textDim },
  actions: { gap: 10, marginTop: 8 },
});
