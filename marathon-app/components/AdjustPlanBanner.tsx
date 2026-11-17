import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { fonts, text, radius, palette } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import type { AdjustmentProposal } from "../lib/data/planAdjustment";

interface AdjustPlanBannerProps {
  proposal: AdjustmentProposal;
  onAccept: () => Promise<void>;
  onDecline: () => void;
}

/**
 * The plan-adjustment prompt, styled as in the design: a warm banner with the question, then
 * two equal buttons. Never auto-applies anything - it only proposes, and only acts on an
 * explicit tap. Accepting regenerates the rest of the plan at a volume the runner can actually
 * sustain right now (see applyMissedRunAdjustment); declining just backs off re-showing this
 * for a while (recordAdjustmentDeclined).
 */
export function AdjustPlanBanner({ proposal, onAccept, onDecline }: AdjustPlanBannerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setApplying(true);
    setError(null);
    try {
      await onAccept();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't adjust your plan.");
      setApplying(false);
    }
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.title}>You've missed {proposal.missedCount} runs this week.</Text>
      <Text style={styles.body}>Want to ease back in? We can rebuild the rest of your plan at a pace that matches what you've actually been running lately.</Text>
      {error ? <Text style={styles.body}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.primary]} onPress={handleAccept} disabled={applying} accessibilityRole="button" accessibilityLabel="Adjust my plan">
          {applying ? <ActivityIndicator color={palette.onAccent} /> : <Text style={styles.primaryText}>Adjust my plan</Text>}
        </Pressable>
        <Pressable style={[styles.btn, styles.secondary]} onPress={onDecline} disabled={applying} accessibilityRole="button" accessibilityLabel="Not now">
          <Text style={styles.secondaryText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    banner: { backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: radius.lg, padding: 14, marginBottom: 12, gap: 4 },
    title: { fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: colors.warningText },
    body: { fontFamily: fonts.body, ...text("body"), color: colors.warningText },
    actions: { flexDirection: "row", gap: 10, marginTop: 10 },
    btn: { flex: 1, minHeight: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
    primary: { backgroundColor: palette.accentFill },
    primaryText: { fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: palette.onAccent },
    secondary: { borderWidth: 1.5, borderColor: colors.warningText },
    secondaryText: { fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: colors.warningText },
  });
}
