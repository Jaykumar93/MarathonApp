import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { requestPasswordReset } from "../../lib/auth/passwordReset";
import { fonts, radius, spacing, text } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { TextField } from "../../components/ui/TextField";
import { KeyboardAvoider } from "../../components/ui/KeyboardAvoider";

export default function ForgotPassword() {
  const router = useRouter();
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

  return (
    <KeyboardAvoider style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View>
          <ScreenHeader title="Reset your password" onBack={() => (router.canGoBack() ? router.back() : router.replace("/sign-in"))} />
          <Text style={styles.subtitle}>Enter the email on your account and we'll send you a reset link.</Text>
        </View>

        <View style={styles.form}>
          <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" required />
          {error && (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}
          <PrimaryButton label={sent ? "Send again" : "Send reset link"} onPress={handleSend} loading={loading} disabled={!email.trim()} />
        </View>

        {sent && (
          <View style={styles.sentCard} accessibilityLiveRegion="polite">
            <Ionicons name="checkmark" size={24} color={colors.textPrimary} />
            <Text style={styles.sentText}>
              If there's an account for {email.trim()}, a reset link is on its way. It's only valid for a little while, so use it soon.
            </Text>
          </View>
        )}

        <View style={styles.footerRow}>
          <Link href="/sign-in" style={styles.footerLink}>
            Back to sign in
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoider>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.screenBg },
    container: { flexGrow: 1, padding: spacing.screenPadding, paddingTop: spacing.screenPadding + 16, gap: 16 },
    subtitle: { fontFamily: fonts.body, ...text("body"), color: colors.textDim },
    form: { gap: 14 },
    error: { fontFamily: fonts.body, ...text("small"), color: colors.dangerText },
    sentCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 16,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardLine,
      backgroundColor: colors.cardBg,
    },
    sentText: { flex: 1, fontFamily: fonts.body, ...text("body"), color: colors.textDim },
    footerRow: { flexDirection: "row", justifyContent: "center" },
    footerLink: { fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.accentText },
  });
}
