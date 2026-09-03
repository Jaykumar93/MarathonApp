import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, fonts, spacing } from "./../lib/theme";
import { PrimaryButton } from "./ui/PrimaryButton";

/**
 * Shown on Home/Plan when the user has no active goal - onboarding is
 * optional and user-initiated (see app/_layout.tsx's AuthGate), so landing
 * here with nothing set up yet is a normal, supported state, not an error.
 */
export function NoPlanPrompt() {
  const router = useRouter();
  return (
    <View style={styles.center}>
      <Text style={styles.title}>No training plan yet</Text>
      <Text style={styles.body}>Set your race goal and we'll build a plan around it.</Text>
      <View style={styles.button}>
        <PrimaryButton label="Create your plan" onPress={() => router.push("/onboarding/race-target")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.screenBg,
    padding: spacing.screenPadding,
    gap: 8,
  },
  title: { fontFamily: fonts.dataBold, fontSize: 20, color: colors.textPrimary },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim, textAlign: "center", marginBottom: 8 },
  button: { width: "100%", maxWidth: 280 },
});
