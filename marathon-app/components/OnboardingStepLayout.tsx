import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fonts, spacing } from "../lib/theme";
import { PrimaryButton } from "./ui/PrimaryButton";

interface OnboardingStepLayoutProps {
  step: number; // 1-5
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  onSkip?: () => void;
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
}: OnboardingStepLayoutProps) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.progressRow}>
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={[styles.progressDot, i <= step && styles.progressDotActive]} />
          ))}
        </View>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        <View style={styles.content}>{children}</View>
      </ScrollView>
      <View style={styles.footer}>
        {onSkip && <PrimaryButton label="Skip" onPress={onSkip} variant="secondary" />}
        <PrimaryButton label={nextLabel} onPress={onNext} disabled={nextDisabled} loading={nextLoading} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.screenBg },
  container: { flexGrow: 1, padding: spacing.screenPadding, gap: 18 },
  progressRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.cardLine },
  progressDotActive: { backgroundColor: colors.accent },
  title: { fontFamily: fonts.dataBold, fontSize: 24, color: colors.textPrimary },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim, marginTop: -8 },
  content: { gap: 16, flex: 1 },
  footer: { flexDirection: "row", gap: 10, padding: spacing.screenPadding, paddingTop: 0 },
});
