import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale as Pressable } from "./ui/PressableScale";
import { formatDistance } from "../lib/units";
import { fonts, radius, text } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";

export type FitnessSource = "logged" | "entered";

interface FitnessSourceChoiceProps {
  loggedKm: number;
  enteredKm: number;
  unit: "km" | "mi";
  value: FitnessSource;
  onChange: (value: FitnessSource) => void;
}

/**
 * Shown when the runner's logged runs and the weekly distance they typed disagree
 * (they typed more). Two clearly selectable options, with the selected one
 * highlighted and ticked, instead of a small link: which number should the plan
 * be built from? The logged runs are the default because they are measured, and
 * the runner's own number is one tap away for when they ran somewhere the app
 * could not see.
 */
export function FitnessSourceChoice({ loggedKm, enteredKm, unit, value, onChange }: FitnessSourceChoiceProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const options: { key: FitnessSource; title: string; km: number; note: string }[] = [
    { key: "logged", title: "Your logged runs", km: loggedKm, note: "Measured from the runs saved in Cursus. Recommended." },
    { key: "entered", title: "The number you entered", km: enteredKm, note: "Choose this if you ran somewhere the app could not see." },
  ];

  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      <Text style={styles.heading}>Your runs and your answer don't match</Text>
      <Text style={styles.sub}>Which weekly distance should we plan from?</Text>
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${o.title}, ${formatDistance(o.km, unit)} a week`}
            style={[styles.option, selected && styles.optionSelected]}
          >
            <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={22} color={selected ? colors.accentMark : colors.textFaint} />
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>{o.title}</Text>
              <Text style={styles.optionNote}>{o.note}</Text>
            </View>
            <Text style={[styles.optionKm, selected && { color: colors.accentText }]}>{formatDistance(o.km, unit)}/wk</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    heading: { fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.textPrimary },
    sub: { fontFamily: fonts.body, ...text("small"), color: colors.textDim, marginBottom: 2 },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardLine,
      backgroundColor: colors.cardBg,
    },
    optionSelected: { borderWidth: 2, borderColor: colors.accentFill },
    optionTitle: { fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.textPrimary },
    optionNote: { fontFamily: fonts.body, ...text("caption"), color: colors.textDim, marginTop: 2 },
    optionKm: { fontFamily: fonts.monoSemiBold, ...text("small"), color: colors.textPrimary },
  });
}
