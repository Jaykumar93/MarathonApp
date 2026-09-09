import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { signInWithGoogle } from "../../lib/auth/googleAuth";
import { fonts, palette, spacing } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { BrandMark } from "../../components/ui/BrandMark";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { TextField } from "../../components/ui/TextField";

export default function SignIn() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
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

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed.");
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.markRow}>
          <BrandMark size={72} />
          <Text style={styles.brandName}>Stryde</Text>
          <Text style={styles.brandKicker}>PRE-DAWN RUN</Text>
        </View>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>Sign in to continue your training block.</Text>

        <View style={styles.form}>
          <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" required />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoComplete="password"
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
          <PrimaryButton label="Sign in" onPress={handleSignIn} loading={loading} disabled={!email || !password} />
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.form}>
          <PrimaryButton
            label="Continue with Google"
            onPress={handleGoogleSignIn}
            variant="secondary"
            loading={googleLoading}
            disabled={loading}
          />
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
    dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.cardLine },
    dividerText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    footerRow: { flexDirection: "row", justifyContent: "center" },
    footerText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textDim },
    footerLink: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.accent },
  });
}
