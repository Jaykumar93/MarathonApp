import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { GenerateResult } from "../lib/planEngine";
import { formatHms } from "../lib/timeFormat";
import { fonts, palette, text, radius } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";

/**
 * Renders whatever generatePlan() has to say about a GoalInput's
 * feasibility - a hard refusal (below the structural floor), a compressed-
 * timeline notice, and/or a capped-goal-time notice. Shared between
 * onboarding's final step and Edit Plan so both surfaces show the exact
 * same warnings for the exact same preview result.
 */
export function PlanFeasibilityWarnings({ preview, hideSchedule = false }: { preview: GenerateResult; hideSchedule?: boolean }) {
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

  const { scheduleFeasibilityWarning: rawScheduleWarning, paceFeasibilityWarning: paceWarning } = preview.plan;
  // The readiness summary already tells the runner their own weeks needed, so callers that show it hide this banner.
  const scheduleWarning = hideSchedule ? undefined : rawScheduleWarning;
  if (!scheduleWarning && !paceWarning) return null;

  return (
    <>
      {scheduleWarning && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Compressed timeline</Text>
          <Text style={styles.bannerBody}>
            For your running right now, this distance needs about {scheduleWarning.minWeeksRecommended} weeks; you have{" "}
            {scheduleWarning.availableWeeks}. We've built the fittest plan we can for your race day, but it peaks lower than a
            full plan would and the ramp-up is more intense than we'd normally recommend.
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
    errorText: { fontFamily: fonts.body, ...text("small"), color: colors.dangerText },
    banner: {
      backgroundColor: colors.warningBg,
      borderWidth: 1,
      borderColor: colors.warningBorder,
      borderRadius: radius.md,
      padding: 12,
    },
    bannerTitle: { fontFamily: fonts.bodySemiBold, ...text("small"), color: colors.warningText },
    bannerBody: { fontFamily: fonts.body, ...text("small"), color: colors.warningText, marginTop: 2 },
  });
}
