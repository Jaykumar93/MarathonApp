import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { colors, fonts, spacing } from "../../lib/theme";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { TextField } from "../../components/ui/TextField";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    // AuthGate in the root layout handles routing once the session updates.
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue your training block.</Text>

        <View style={styles.form}>
          <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" />
          <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
          {error && (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}
          <PrimaryButton label="Sign in" onPress={handleSignIn} loading={loading} disabled={!email || !password} />
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.form}>
          <PrimaryButton label="Continue with Google (coming soon)" onPress={() => {}} variant="secondary" disabled />
          <PrimaryButton label="Continue with Apple (coming soon)" onPress={() => {}} variant="secondary" disabled />
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>New here? </Text>
          <Link href="/sign-up" style={styles.footerLink}>
            Create an account
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.screenBg },
  container: { flexGrow: 1, padding: spacing.screenPadding, justifyContent: "center", gap: 22 },
  title: { fontFamily: fonts.dataBold, fontSize: 28, color: colors.textPrimary },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  form: { gap: 14 },
  error: { fontFamily: fonts.body, fontSize: 13, color: "#B3261E" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.cardLine },
  dividerText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  footerRow: { flexDirection: "row", justifyContent: "center" },
  footerText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textDim },
  footerLink: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.accent },
});
