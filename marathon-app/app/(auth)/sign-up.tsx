import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { fonts, palette, spacing } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { BrandMark } from "../../components/ui/BrandMark";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { TextField } from "../../components/ui/TextField";

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export default function SignUp() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationNeeded, setConfirmationNeeded] = useState(false);

  async function handleSignUp() {
    setError(null);

    if (!USERNAME_PATTERN.test(username)) {
      setError("Username must be 3-20 characters: lowercase letters, numbers, and underscores only.");
      return;
    }

    setLoading(true);

    // Anonymous signup can't read `profiles` directly under RLS (auth.uid()
    // is null pre-signup) - username_available is a narrow, security-definer
    // RPC built specifically for this check, returning only a boolean.
    const { data: available, error: availabilityError } = await supabase.rpc("username_available", {
      desired: username,
    });
    if (availabilityError) {
      setLoading(false);
      setError("Couldn't check that username right now. Try again.");
      return;
    }
    if (!available) {
      setLoading(false);
      setError("That username is already taken.");
      return;
    }

    // full_name/username go through signup metadata (not a follow-up
    // profile update) so they're captured correctly whether or not "Confirm
    // email" is on - no session exists yet to run an update against until
    // confirmed.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim(), username } },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (!data.session) {
      // "Confirm email" is currently OFF in Supabase (verified live via a
      // real signUp call, not assumed - see MAIN_PLAN.md's pre-launch
      // checklist), so a session normally comes back immediately and this
      // branch doesn't fire today. Kept as a real fallback for whenever
      // that setting gets turned back on before real testers are invited -
      // !data.session is exactly what that looks like once it is.
      setConfirmationNeeded(true);
    }
    // If a session came back immediately, AuthGate handles routing to /waitlist.
  }

  if (confirmationNeeded) {
    return (
      <View style={[styles.flex, styles.container]}>
        <View style={styles.markRow}>
          <BrandMark size={72} />
          <Text style={styles.brandName}>Stryde</Text>
          <Text style={styles.brandKicker}>PRE-DAWN RUN</Text>
        </View>
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
        <View style={styles.markRow}>
          <BrandMark size={72} />
          <Text style={styles.brandName}>Stryde</Text>
          <Text style={styles.brandKicker}>PRE-DAWN RUN</Text>
        </View>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>You'll join the waitlist first - access is approved manually.</Text>

        <View style={styles.form}>
          <TextField label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" autoCapitalize="words" required />
          <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" required />
          <TextField
            label="Username"
            value={username}
            onChangeText={(t) => setUsername(t.toLowerCase())}
            autoComplete="username-new"
            placeholder="lowercase letters, numbers, _"
            required
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoComplete="password-new"
            required
            rightElement={
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              >
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textFaint} />
              </Pressable>
            }
          />
          {error && (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}
          <Text style={styles.consentText}>
            By creating an account, you agree to our{" "}
            <Link href="/privacy-policy" style={styles.consentLink}>
              Privacy Policy
            </Link>
            .
          </Text>
          <PrimaryButton
            label="Sign up"
            onPress={handleSignUp}
            loading={loading}
            disabled={!fullName || !email || !username || !password}
          />
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

function createStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.screenBg },
    container: { flexGrow: 1, padding: spacing.screenPadding, justifyContent: "center", gap: 22 },
    markRow: { alignItems: "center", gap: 6, marginBottom: 10 },
    brandName: { fontFamily: fonts.dataBold, fontSize: 30, color: colors.textPrimary, letterSpacing: -0.6, marginTop: 2 },
    brandKicker: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, letterSpacing: 2.5, textTransform: "uppercase" },
    title: { fontFamily: fonts.dataBold, fontSize: 28, color: colors.textPrimary },
    subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
    form: { gap: 14 },
    error: { fontFamily: fonts.body, fontSize: 13, color: palette.danger },
    footerRow: { flexDirection: "row", justifyContent: "center" },
    footerText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textDim },
    footerLink: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.accent },
    consentText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, lineHeight: 16 },
    consentLink: { fontFamily: fonts.bodySemiBold, color: colors.accent },
  });
}
