import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { RoutePoint } from "../lib/gpsStats";
import { fonts } from "../lib/theme";

interface RunMapProps {
  points: RoutePoint[];
  live?: boolean;
}

/**
 * react-native-maps has no working web build - its native view managers
 * throw at import time under react-native-web (confirmed against this
 * project's own web preview, not just the library's docs), unlike most
 * other native modules here which either no-op or have a real .web.ts of
 * their own. Metro picks this file over RunMap.tsx automatically for a web
 * bundle - android/iOS still get the real map, this is purely so the web
 * preview this project develops against doesn't crash.
 */
export function RunMap({}: RunMapProps) {
  return (
    <View style={styles.fill}>
      <Text style={styles.text}>Map preview is available on the Android app, not this web build</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  text: { fontFamily: fonts.body, fontSize: 12, color: "#5a5d62", textAlign: "center", paddingHorizontal: 30 },
});
