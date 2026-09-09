import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fonts } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { PrimaryButton } from "./ui/PrimaryButton";
import type { AdjustmentProposal } from "../lib/data/planAdjustment";

interface AdjustPlanBannerProps {
  proposal: AdjustmentProposal;
  onAccept: () => Promise<void>;
  onDecline: () => void;
}

/**
 * Never auto-applies anything (per the adaptive-adjustment spec) - this
 * only ever proposes, and only acts on an explicit tap. Accepting
 * regenerates the rest of the plan at a volume the runner can actually
 * sustain right now (see applyMissedRunAdjustment); declining just backs
 * off re-showing this for a while (recordAdjustmentDeclined).
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
      <Text style={styles.title}>You've missed {proposal.missedCount} runs this week</Text>
      <Text style={styles.body}>
        Want to ease back in? We can rebuild the rest of your plan at a pace that matches what you've actually
        been running lately, instead of picking up where the original schedule left off.
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <PrimaryButton label="Adjust my plan" onPress={handleAccept} loading={applying} disabled={applying} />
        </View>
        <View style={{ flex: 1 }}>
          <PrimaryButton label="Not now" variant="secondary" onPress={onDecline} disabled={applying} />
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    banner: {
      backgroundColor: colors.warningBg,
      borderWidth: 1,
      borderColor: colors.warningBorder,
      borderRadius: 10,
      padding: 12,
      marginBottom: 14,
    },
    title: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.warningText },
    body: { fontFamily: fonts.body, fontSize: 12.5, color: colors.warningText, marginTop: 4 },
    error: { fontFamily: fonts.body, fontSize: 12, color: colors.warningText, marginTop: 8 },
    actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  });
}
