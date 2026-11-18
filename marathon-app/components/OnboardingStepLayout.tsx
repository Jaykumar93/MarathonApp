import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PressableScale as Pressable } from "./ui/PressableScale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { fonts, palette, radius, spacing, text } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { PrimaryButton } from "./ui/PrimaryButton";
import { KeyboardAvoider } from "../components/ui/KeyboardAvoider";
import { BackLink } from "./ui/ScreenHeader";

export const STEP_COUNT = 6;

interface OnboardingStepLayoutProps {
  step: number; // 1-6
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  onSkip?: () => void;
  nextVariant?: "primary" | "secondary";
}

export function OnboardingStepLayout({
  step,
  title,
  subtitle,
  children,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
  nextLoading,
  onSkip,
  nextVariant,
}: OnboardingStepLayoutProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <KeyboardAvoider style={styles.flex}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.container, { paddingTop: 10 + insets.top }]}
      >
        <View
          style={styles.progressRow}
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${step} of ${STEP_COUNT}`}
        >
          {Array.from({ length: STEP_COUNT }, (_, k) => k + 1).map((i) => (
            <View key={i} style={[styles.progressSeg, i <= step && styles.progressSegActive]} />
          ))}
        </View>
        <View style={styles.topRow}>
          {step > 1 ? <BackLink onPress={() => router.back()} /> : <View />}
          {/* Onboarding is optional - browsing the app without a plan yet
              is a supported state (Home shows a "Create your plan" prompt
              instead), so leaving mid-setup is always available, not just
              a one-time skip. */}
          <Pressable accessibilityRole="button" onPress={() => router.replace("/(tabs)")} hitSlop={10}>
            <Text style={styles.exitLink}>Exit setup</Text>
          </Pressable>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        <View style={styles.content}>{children}</View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}>
        <PrimaryButton label={nextLabel} onPress={onNext} disabled={nextDisabled} loading={nextLoading} variant={nextVariant} />
        {onSkip && (
          <Pressable onPress={onSkip} hitSlop={8} accessibilityRole="button" accessibilityLabel="Skip" style={styles.skip}>
            <Text style={styles.skipLabel}>Skip</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoider>
  );
}

/** Pill-shaped single-select chips, as in the onboarding mockup (selected = violet fill, white text). */
export function PillChips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.chipWrap}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            disabled={o.disabled}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: o.disabled }}
            style={[styles.chip, selected && styles.chipSelected, o.disabled && { opacity: 0.45 }]}
          >
            <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small mono uppercase label above a group of controls. */
export function GroupLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <Text style={styles.groupLabel}>{children}</Text>;
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.screenBg },
    container: { flexGrow: 1, paddingHorizontal: spacing.screenPadding, paddingBottom: 16, gap: 14 },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 28 },
    exitLink: { fontFamily: fonts.bodyMedium, ...text("small"), color: colors.textFaint },
    progressRow: { flexDirection: "row", gap: 6 },
    progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.cardLine },
    progressSegActive: { backgroundColor: colors.accentFill },
    title: { fontFamily: fonts.dataBold, ...text("headline"), color: colors.textPrimary },
    subtitle: { fontFamily: fonts.body, ...text("body"), color: colors.textDim, marginTop: -6 },
    content: { gap: 16, flex: 1 },
    footer: { paddingHorizontal: spacing.screenPadding, paddingTop: 8, gap: 4 },
    skip: { alignItems: "center", paddingVertical: 10 },
    skipLabel: { fontFamily: fonts.bodyMedium, ...text("body"), color: colors.textDim },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      paddingHorizontal: 18,
      minHeight: 40,
      justifyContent: "center",
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.cardLine,
      backgroundColor: colors.cardBg,
    },
    chipSelected: { borderColor: colors.accentFill, backgroundColor: colors.accentFill },
    chipLabel: { fontFamily: fonts.bodyMedium, ...text("body"), color: colors.textPrimary },
    chipLabelSelected: { color: palette.onAccent },
    groupLabel: { fontFamily: fonts.monoMedium, ...text("caption"), letterSpacing: 1.2, textTransform: "uppercase", color: colors.textDim },
  });
}
