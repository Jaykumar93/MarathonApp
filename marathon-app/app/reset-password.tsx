import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { fonts, palette, spacing } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { BrandMark } from "../components/ui/BrandMark";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { TextField } from "../components/ui/TextField";

/**
 * Only ever reached via the password-recovery email link - see
 * isPasswordRecoveryUrl/the linking-url effect in app/_layout.tsx, which
 * exchanges the link's code for a real session and sends it here instead
 * of wherever AuthGate would otherwise route an already-authenticated
 * user. That exchange is what makes updateUser below valid - there's no
 * separate "verify you're allowed to be here" step on this screen itself.
 */
export default function ResetPassword() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    // Not approved yet? AuthGate's own effect corrects this to /waitlist
    // right after - segments no longer say "reset-password" once we've
    // already navigated, so nothing here needs to know approval status.
    router.replace("/(tabs)");
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.markRow}>
          <BrandMark size={56} />
        </View>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>Choose something you haven't used on this account before.</Text>

        <View style={styles.form}>
          <TextField
            label="New password"
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
          <TextField
            label="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            autoComplete="password-new"
            required
          />
          {error && (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}
          <PrimaryButton
            label="Save password"
            onPress={handleSave}
            loading={loading}
            disabled={!password || !confirmPassword}
          />
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
    subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
    form: { gap: 14 },
    error: { fontFamily: fonts.body, fontSize: 13, color: palette.danger },
  });
}
