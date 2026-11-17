import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fonts, text, radius } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { Ionicons } from "@expo/vector-icons";

interface ReferenceChipProps {
  label: string;
  /** Omit for an informational chip (a knowledge-base article title) that isn't itself a navigable screen - only an activity reference is tappable. */
  onPress?: () => void;
}

/** Small pill under a coach reply, citing what it actually drew on - a knowledge-base article title (informational) or a source activity (tappable, jumps to its Run Summary). Distinct from Badge.tsx, which is a fixed numeric-count pill with no label/press support. */
export function ReferenceChip({ label, onPress }: ReferenceChipProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!onPress) {
    return (
      <View style={styles.chip}>
        <Text style={styles.text}>{label}</Text>
      </View>
    );
  }

  return (
    <Pressable style={styles.chip} onPress={onPress} hitSlop={4} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.text}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.secondaryAccent} />
    </Pressable>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.cardLine,
      borderRadius: radius.pill,
      paddingVertical: 5,
      paddingHorizontal: 10,
    },
    text: { fontFamily: fonts.bodyMedium, ...text("caption"), color: colors.textDim },
  });
}
