import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { requestPasswordReset } from "../../lib/auth/passwordReset";
import { fonts, palette, spacing } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { BrandMark } from "../../components/ui/BrandMark";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { TextField } from "../../components/ui/TextField";

export default function ForgotPassword() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      // Supabase's own message for this endpoint doesn't confirm/deny
      // whether the address has an account - kept as-is rather than
      // rewritten, so this never becomes a way to check who's registered.
      setError(e instanceof Error ? e.message : "Couldn't send that right now. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <View style={[styles.flex, styles.container]}>
        <View style={styles.markRow}>
          <BrandMark size={56} />
        </View>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          If there's an account for {email.trim()}, a reset link is on its way. It's only valid for a little while,
          so use it soon.
        </Text>
        <Link href="/sign-in" style={styles.footerLink}>
          Back to sign in
        </Link>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.markRow}>
          <BrandMark size={56} />
        </View>
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.subtitle}>Enter the email on your account and we'll send you a reset link.</Text>

        <View style={styles.form}>
          <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" required />
          {error && (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}
          <PrimaryButton label="Send reset link" onPress={handleSend} loading={loading} disabled={!email.trim()} />
        </View>

        <View style={styles.footerRow}>
          <Link href="/sign-in" style={styles.footerLink}>
            Back to sign in
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.screenBg },
    container: { flexGrow: 1, padding: spacing.screenPadding, justifyContent: "center", gap: 22 },
    markRow: { alignItems: "center", marginBottom: 4 },
    title: { fontFamily: fonts.dataBold, fontSize: 26, color: colors.textPrimary },
    subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim, lineHeight: 19 },
    form: { gap: 14 },
    error: { fontFamily: fonts.body, fontSize: 13, color: palette.danger },
    footerRow: { flexDirection: "row", justifyContent: "center" },
    footerLink: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.accent },
  });
}
