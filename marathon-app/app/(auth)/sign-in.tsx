import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { signInWithGoogle } from "../../lib/auth/googleAuth";
import { fonts, spacing, text } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { BrandLockup } from "../../components/ui/Wordmark";
import { Pika } from "../../components/mascot/Pika";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { TextField } from "../../components/ui/TextField";
import { KeyboardAvoider } from "../../components/ui/KeyboardAvoider";

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
    <KeyboardAvoider style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.markRow}>
          <BrandLockup size={26} />
          <Pika expression="easy" size={52} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Train for the marathon. Know why every run is there.
        </Text>

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
          <Link href="/forgot-password" style={styles.forgotLink}>
            Forgot password?
          </Link>
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
    </KeyboardAvoider>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.screenBg },
    container: { flexGrow: 1, padding: spacing.screenPadding, paddingTop: spacing.screenPadding + 16, justifyContent: "center", gap: 20 },
    markRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontFamily: fonts.dataBold, ...text("display"), color: colors.textPrimary },
    form: { gap: 14 },
    forgotLink: { fontFamily: fonts.bodyMedium, ...text("body"), color: colors.textDim, textAlign: "center", paddingVertical: 6 },
    error: { fontFamily: fonts.body, ...text("small"), color: colors.dangerText },
    dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.cardLine },
    dividerText: { fontFamily: fonts.body, ...text("caption"), color: colors.textFaint },
    footerRow: { flexDirection: "row", justifyContent: "center" },
    footerText: { fontFamily: fonts.body, ...text("body"), color: colors.textDim },
    footerLink: { fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.accentText },
  });
}
