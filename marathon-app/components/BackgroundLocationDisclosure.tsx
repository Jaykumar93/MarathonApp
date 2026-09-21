import React, { useMemo } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, spacing, type } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { PrimaryButton } from "./ui/PrimaryButton";

/**
 * Shown once, right before the OS's own background-location permission
 * dialog, the first time a run actually needs it (i.e. only when
 * Location.getBackgroundPermissionsAsync() isn't already "granted" - see
 * RunTrackingContext's startRun). This is what Play's policy for
 * ACCESS_BACKGROUND_LOCATION actually requires beyond the system dialog's
 * own permission-rationale string: a separate, app-rendered explanation the
 * runner has to affirmatively act on before the OS prompt appears, not just
 * text inside a dialog they might tap through on reflex.
 */
export function BackgroundLocationDisclosure({
  visible,
  onContinue,
  onDecline,
}: {
  visible: boolean;
  onContinue: () => void;
  onDecline: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.iconCircle}>
            <Ionicons name="navigate-outline" size={24} color={colors.accent} />
          </View>
          <Text style={styles.title}>Track your run in the background</Text>
          <Text style={styles.body}>
            Stryde uses your location, including while your screen is off or another app is open, to keep tracking
            your route, distance, and pace for the whole run. It's only used while a run is active.
          </Text>
          <View style={styles.actions}>
            <PrimaryButton label="Continue" onPress={onContinue} />
            <View style={{ height: spacing.cardGap }} />
            <PrimaryButton label="Not now" variant="secondary" onPress={onDecline} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
    sheet: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: colors.sheetBg,
      borderRadius: spacing.cardRadius,
      padding: 24,
      alignItems: "center",
    },
    iconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: `${colors.accent}1A`,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    title: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary, textAlign: "center", marginBottom: 8 },
    body: { fontFamily: fonts.body, fontSize: type.pDim, color: colors.textDim, textAlign: "center", lineHeight: 20, marginBottom: 22 },
    actions: { width: "100%" },
  });
}
