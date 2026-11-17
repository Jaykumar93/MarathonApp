import React from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

/**
 * KeyboardAvoidingView with the one behavior split every form screen needs:
 * "padding" on iOS, "height" on Android. Six screens each typed that ternary
 * out themselves - one place now, so a keyboard fix lands everywhere.
 */
export function KeyboardAvoider({
  children,
  style,
  offset,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Distance from the top of the screen to this view - only needed under a header. */
  offset?: number;
}) {
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={offset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
