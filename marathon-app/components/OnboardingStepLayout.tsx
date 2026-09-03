import React from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
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
  const router = useRouter();

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topRow}>
          {step > 1 ? (
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Text style={styles.backLink}>‹ Back</Text>
            </Pressable>
          ) : (
            <View />
          )}
          {/* Onboarding is optional - browsing the app without a plan yet
              is a supported state (Home shows a "Create your plan" prompt
              instead), so leaving mid-setup is always available, not just
              a one-time skip. */}
          <Pressable onPress={() => router.replace("/(tabs)")} hitSlop={10}>
            <Text style={styles.exitLink}>Exit setup</Text>
          </Pressable>
        </View>
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
        {onSkip && (
          <View style={styles.footerButton}>
            <PrimaryButton label="Skip" onPress={onSkip} variant="secondary" />
          </View>
        )}
        <View style={styles.footerButton}>
          <PrimaryButton label={nextLabel} onPress={onNext} disabled={nextDisabled} loading={nextLoading} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.screenBg },
  container: { flexGrow: 1, padding: spacing.screenPadding, gap: 18 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backLink: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textDim },
  exitLink: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textFaint },
  progressRow: { flexDirection: "row", gap: 6 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.cardLine },
  progressDotActive: { backgroundColor: colors.accent },
  title: { fontFamily: fonts.dataBold, fontSize: 24, color: colors.textPrimary },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim, marginTop: -8 },
  content: { gap: 16, flex: 1 },
  footer: { flexDirection: "row", gap: 10, padding: spacing.screenPadding, paddingTop: 0 },
  // PrimaryButton's own style is width:"100%" (correct for its normal
  // full-width use elsewhere) - without this, two of them side-by-side in
  // this row (Skip + Continue) would each claim the full row width and
  // visually overlap instead of splitting it evenly.
  footerButton: { flex: 1 },
});
