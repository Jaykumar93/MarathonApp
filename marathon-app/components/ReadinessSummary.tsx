import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Readiness } from "../lib/planEngine";
import { formatDistance } from "../lib/units";
import { fonts, radius, text } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";

interface ReadinessSummaryProps {
  readiness: Readiness;
  /** Race distance in km, for the sentence ("a 21.1 km race"). */
  raceDistanceKm: number;
  unit: "km" | "mi";
  /** Called when the runner taps "Use my number" after the logged runs were used instead of their answer. */
  onUseEnteredNumber?: () => void;
}

function distanceName(km: number): string {
  if (Math.abs(km - 5) < 0.1) return "a 5K";
  if (Math.abs(km - 10) < 0.1) return "a 10K";
  if (Math.abs(km - 21.0975) < 0.2) return "a half marathon";
  if (Math.abs(km - 42.195) < 0.3) return "a marathon";
  return `a ${Math.round(km * 10) / 10} km race`;
}

/**
 * The runner's own number, in plain words: how many weeks THEY need for this
 * distance, how many they have, and what it rests on. Rendered by the race-date
 * step and Edit plan. All figures come from the plan engine (never the AI), and
 * the wording says "based on what you told us" when no logged runs were used,
 * so an estimate never reads as a measurement.
 */
export function ReadinessSummary({ readiness, raceDistanceKm, unit, onUseEnteredNumber }: ReadinessSummaryProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const base = formatDistance(readiness.currentBaseKm, unit);
  const basis = readiness.basedOnAnswersOnly ? "Based on what you told us" : "Based on your logged runs";
  const tone =
    readiness.verdict === "comfortable"
      ? { label: "ON TRACK", color: colors.successText }
      : readiness.verdict === "tight"
        ? { label: "TIGHT", color: colors.warningText }
        : { label: "SHORT ON TIME", color: colors.warningText };

  const headline = `For your current running (about ${base} a week), ${distanceName(raceDistanceKm)} needs about ${readiness.weeksNeeded} weeks. You have ${readiness.weeksAvailable}.`;

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <Text style={[styles.label, { color: tone.color }]}>{tone.label}</Text>
      <Text style={styles.headline}>{headline}</Text>
      {readiness.verdict !== "comfortable" && (
        <Text style={styles.body}>
          We can still build a plan. It will peak at about {formatDistance(readiness.reachablePeakKm, unit)} a week instead of{" "}
          {formatDistance(readiness.targetPeakKm, unit)}, so it prepares you to finish comfortably rather than to chase a fast time.
          A later date, or a shorter distance, gives a fuller build-up.
        </Text>
      )}
      {readiness.returningRunner && (
        <Text style={styles.body}>You're rebuilding after time off, so the early weeks climb back a little faster, up to the level you handled before.</Text>
      )}
      <Text style={styles.basis}>{basis}.</Text>
      {readiness.usedLoggedInsteadOfEntered && (
        <View>
          <Text style={styles.body}>
            We used {formatDistance(readiness.usedLoggedInsteadOfEntered.loggedKm, unit)} a week from your logged runs; you said{" "}
            {formatDistance(readiness.usedLoggedInsteadOfEntered.enteredKm, unit)}.
          </Text>
          {onUseEnteredNumber && (
            <Text style={styles.link} onPress={onUseEnteredNumber} accessibilityRole="button">
              Use my number instead
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    card: { backgroundColor: colors.cardBg, borderColor: colors.cardLine, borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 6 },
    label: { fontFamily: fonts.monoMedium, ...text("micro"), letterSpacing: 1.1 },
    headline: { fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.textPrimary },
    body: { fontFamily: fonts.body, ...text("small"), color: colors.textDim },
    basis: { fontFamily: fonts.bodyMedium, ...text("caption"), color: colors.textFaint },
    link: { fontFamily: fonts.bodySemiBold, ...text("small"), color: colors.accentText, paddingVertical: 6 },
  });
}
