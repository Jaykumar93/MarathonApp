import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { Pika } from "../components/mascot/Pika";
import { PIKA_EXPRESSIONS } from "../components/mascot/pikaFace";
import { BrandLockup, Wordmark } from "../components/ui/Wordmark";
import { BrandMark } from "../components/ui/BrandMark";
import { DateField } from "../components/ui/DateField";
import { DurationField } from "../components/ui/DurationField";
import { StartDayPicker } from "../components/StartDayPicker";
import type { StartOn } from "../lib/planEngine";
import { fonts, palette, radius, text } from "../lib/theme";
import { useTheme } from "../lib/theme/ThemeContext";

const SWATCHES: Array<[string, string]> = [
  ["ink", palette.ink],
  ["bone", palette.bone],
  ["accent", palette.accent],
  ["accentLift", palette.accentLift],
  ["accentGlow", palette.accentGlow],
  ["contour", palette.contour],
  ["success", palette.success],
  ["warning", palette.warning],
  ["danger", palette.danger],
  ["interval", palette.interval],
  ["race", palette.race],
];

/**
 * Development-only: every brand asset and token on one screen, in whichever theme
 * is active, so a palette/font/mascot change can be checked at a glance. Not a
 * product screen - in a production build it just redirects home.
 */
export default function DevGallery() {
  const { colors, mode } = useTheme();
  const [raceDate, setRaceDate] = useState("");
  const [goalTime, setGoalTime] = useState("");
  const [startOn, setStartOn] = useState<StartOn>("first_run");
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <ScrollView style={{ backgroundColor: colors.screenBg }} contentContainerStyle={styles.content}>
      <Text style={[styles.h, { color: colors.textPrimary }]}>Brand gallery ({mode})</Text>

      <Text style={[styles.label, { color: colors.textDim }]}>LOGO</Text>
      <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardLine }]}>
        <BrandLockup size={30} />
        <View style={styles.row}>
          <BrandMark size={64} />
          <BrandMark size={32} />
          <BrandMark size={16} />
          <Wordmark size={22} />
        </View>
      </View>

      <Text style={[styles.label, { color: colors.textDim }]}>PIKA</Text>
      <View style={[styles.card, styles.wrap, { backgroundColor: colors.cardBg, borderColor: colors.cardLine }]}>
        {PIKA_EXPRESSIONS.map((e) => (
          <View key={e} style={styles.cell}>
            <Pika expression={e} size={84} />
            <Text style={[styles.caption, { color: colors.textDim }]}>{e}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.label, { color: colors.textDim }]}>PALETTE</Text>
      <View style={styles.wrap}>
        {SWATCHES.map(([name, hex]) => (
          <View key={name} style={styles.swatchCell}>
            <View style={[styles.swatch, { backgroundColor: hex, borderColor: colors.cardLine }]} />
            <Text style={[styles.caption, { color: colors.textPrimary }]}>{name}</Text>
            <Text style={[styles.mono, { color: colors.textDim }]}>{hex}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.label, { color: colors.textDim }]}>TEXT ROLES</Text>
      <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardLine }]}>
        {(
          [
            ["textPrimary", colors.textPrimary],
            ["textDim", colors.textDim],
            ["textFaint", colors.textFaint],
            ["accentText", colors.accentText],
            ["secondaryAccent", colors.secondaryAccent],
            ["successText", colors.successText],
            ["dangerText", colors.dangerText],
            ["intervalText", colors.intervalText],
          ] as Array<[string, string]>
        ).map(([name, color]) => (
          <Text key={name} style={{ color, fontFamily: fonts.bodyMedium, ...text("body") }}>
            {name} - the plan builds toward it
          </Text>
        ))}
      </View>

      <Text style={[styles.label, { color: colors.textDim }]}>PICKERS</Text>
      <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardLine, gap: 14 }]}>
        <DateField label="Race date" value={raceDate} onChange={setRaceDate} />
        <DurationField label="Goal finish time (optional)" value={goalTime} onChange={setGoalTime} optional maxHours={40} />
        <StartDayPicker input={{ raceDistanceKm: 21.0975, trainingDaysPerWeek: 4, longRunDay: "sat", experienceLevel: "intermediate" }} value={startOn} onChange={setStartOn} />
        <Text style={{ color: colors.textDim, fontFamily: fonts.mono, ...text("caption") }}>
          date {raceDate || "-"} | time {goalTime || "-"} | start {startOn}
        </Text>
      </View>

      <Text style={[styles.label, { color: colors.textDim }]}>TYPE</Text>
      <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardLine }]}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.dataBold, ...text("headline") }}>Bricolage Grotesque Bold</Text>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.body, ...text("body") }}>Figtree Regular: body text, forms, coach chat.</Text>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.monoSemiBold, ...text("stat") }}>5:12 /km  42.2 km</Text>
        <Text style={{ color: colors.textDim, fontFamily: fonts.monoMedium, ...text("micro"), letterSpacing: 1 }}>DISTANCE  PACE  TIME</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, gap: 10, paddingBottom: 60 },
  h: { fontFamily: fonts.dataBold, ...text("headline") },
  label: { fontFamily: fonts.monoMedium, ...text("micro"), letterSpacing: 1.2, marginTop: 10 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cell: { alignItems: "center", width: 88 },
  swatchCell: { width: 92 },
  swatch: { height: 40, borderRadius: radius.sm, borderWidth: 1, marginBottom: 4 },
  caption: { fontFamily: fonts.bodyMedium, ...text("caption") },
  mono: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 14 },
});
