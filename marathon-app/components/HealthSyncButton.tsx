import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth/AuthContext";
import { supabase } from "../lib/supabase";
import { healthConnectProvider } from "../lib/health/healthConnectProvider";
import { syncHealthActivities } from "../lib/health/syncHealthData";
import { useTheme } from "../lib/theme/ThemeContext";

/**
 * Header-bar shortcut living next to ProfileButton (same header row for the
 * same reason HomeGreeting does - anything in the scrollable screen content
 * below is a different layout tree and would never reliably line up with
 * it). One button covers both "connect" and "sync" - a first tap requests
 * permission and runs the initial sync in the same motion, a later tap
 * (already connected) just re-syncs - so there's always exactly one control
 * to reach for regardless of connection state, replacing a separate nudge
 * popup the user had to notice and act on before this existed.
 */
export function HealthSyncButton() {
  const { session, profile, refreshProfile } = useAuth();
  const { colors } = useTheme();
  const [available, setAvailable] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    healthConnectProvider.isAvailable().then(setAvailable);
  }, []);

  if (!available || !session?.user?.id || !profile) return null;

  const isConnected = profile.health_data_source === "health_connect";

  async function handlePress() {
    if (!session?.user?.id || !profile) return;
    setSyncing(true);
    try {
      if (!isConnected) {
        const granted = await healthConnectProvider.requestPermissions();
        if (!granted) {
          Alert.alert("Health Connect", "Permission wasn't granted - allow Stryde access from Health Connect's own app settings.");
          return;
        }
      }
      const result = await syncHealthActivities(session.user.id, healthConnectProvider);
      if (!isConnected) {
        await supabase.from("profiles").update({ health_data_source: "health_connect" }).eq("id", profile.id);
        await refreshProfile();
      }
      Alert.alert(
        "Health Connect",
        result.imported > 0
          ? `Synced ${result.imported} new run${result.imported === 1 ? "" : "s"}.`
          : "No new running activities found."
      );
    } catch (e) {
      Alert.alert("Health Connect", e instanceof Error ? e.message : "Couldn't sync with Health Connect.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={syncing}
      hitSlop={8}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={isConnected ? "Sync Health Connect" : "Connect Health Connect"}
    >
      {syncing ? (
        <ActivityIndicator size="small" color={colors.textDim} />
      ) : (
        <Ionicons name="sync-outline" size={20} color={isConnected ? colors.accent : colors.textFaint} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});
