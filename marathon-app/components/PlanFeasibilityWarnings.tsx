import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { GenerateResult } from "../lib/planEngine";
import { formatHms } from "../lib/timeFormat";
import { fonts, palette } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";

/**
 * Renders whatever generatePlan() has to say about a GoalInput's
 * feasibility - a hard refusal (below the structural floor), a compressed-
 * timeline notice, and/or a capped-goal-time notice. Shared between
 * onboarding's final step and Edit Plan so both surfaces show the exact
 * same warnings for the exact same preview result.
 */
export function PlanFeasibilityWarnings({ preview }: { preview: GenerateResult }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!preview.ok) {
    return (
      <Text style={styles.errorText}>
        Not enough time before race day - needs at least {preview.minWeeksRequired} weeks, only{" "}
        {preview.availableWeeks} available. Go back and pick a later date.
      </Text>
    );
  }

  const { scheduleFeasibilityWarning: scheduleWarning, paceFeasibilityWarning: paceWarning } = preview.plan;
  if (!scheduleWarning && !paceWarning) return null;

  return (
    <>
      {scheduleWarning && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Compressed timeline</Text>
          <Text style={styles.bannerBody}>
            Typical plans for this distance use {scheduleWarning.minWeeksRecommended}+ weeks; you have{" "}
            {scheduleWarning.availableWeeks}. We've built the fittest plan we can for your race day, but
            expect a more intense ramp-up than we'd normally recommend.
          </Text>
        </View>
      )}
      {paceWarning && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Goal time adjusted</Text>
          <Text style={styles.bannerBody}>
            Your goal of {formatHms(paceWarning.requestedTimeSeconds)} looks faster than your recent race
            result supports. We've built your plan around a more realistic{" "}
            {formatHms(paceWarning.achievableTimeSeconds)} instead.
          </Text>
        </View>
      )}
    </>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    errorText: { fontFamily: fonts.body, fontSize: 13, color: palette.danger },
    banner: {
      backgroundColor: colors.warningBg,
      borderWidth: 1,
      borderColor: colors.warningBorder,
      borderRadius: 10,
      padding: 12,
    },
    bannerTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.warningText },
    bannerBody: { fontFamily: fonts.body, fontSize: 12.5, color: colors.warningText, marginTop: 2 },
  });
}
