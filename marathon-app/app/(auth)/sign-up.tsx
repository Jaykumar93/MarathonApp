import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { supabase } from "../../lib/supabase";
import { colors, fonts, spacing } from "../../lib/theme";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { TextField } from "../../components/ui/TextField";

export default function SignUp() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationNeeded, setConfirmationNeeded] = useState(false);

  async function handleSignUp() {
    setError(null);
    setLoading(true);
    // full_name goes through signup metadata (not a follow-up profile
    // update) so it's captured correctly whether or not "Confirm email" is
    // on - no session exists yet to run an update against until confirmed.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (!data.session) {
      // "Confirm email" is on for this project - the session only appears after confirming.
      setConfirmationNeeded(true);
    }
    // If a session came back immediately, AuthGate handles routing to /waitlist.
  }

  if (confirmationNeeded) {
    return (
      <View style={[styles.flex, styles.container]}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a confirmation link to {email}. Confirm it, then come back and sign in.
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
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>You'll join the waitlist first - access is approved manually.</Text>

        <View style={styles.form}>
          <TextField label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" autoCapitalize="words" />
          <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" />
          <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password-new" />
          {error && (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}
          <PrimaryButton label="Sign up" onPress={handleSignUp} loading={loading} disabled={!fullName || !email || !password} />
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/sign-in" style={styles.footerLink}>
            Sign in
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
  footerRow: { flexDirection: "row", justifyContent: "center" },
  footerText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textDim },
  footerLink: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.accent },
});
