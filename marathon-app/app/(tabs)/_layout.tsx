import { Tabs, useRouter } from "expo-router";
import { ColorValue, Pressable, StyleSheet, Text } from "react-native";
import { useAuth } from "../../lib/auth/AuthContext";
import { colors, fonts } from "../../lib/theme";

function TabIcon({ symbol, color }: { symbol: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{symbol}</Text>;
}

// Profile access lives in the shared tab header (not on any one screen) so
// it's reachable from every tab - including Home/Plan when they're showing
// NoPlanPrompt instead of real plan data, since having no goal yet is a
// normal, supported state, not a reason to lose access to Settings.
function ProfileButton() {
  const router = useRouter();
  const { profile } = useAuth();
  const displayName = profile?.full_name || profile?.username || profile?.email?.split("@")[0] || "?";

  return (
    <Pressable style={styles.avatar} onPress={() => router.push("/settings")} hitSlop={8}>
      <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTitle: "",
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.screenBg },
        headerRight: () => <ProfileButton />,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { height: 74, paddingTop: 9, borderTopColor: colors.cardLine },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <TabIcon symbol="⌂" color={color} /> }} />
      <Tabs.Screen name="plan" options={{ title: "Plan", tabBarIcon: ({ color }) => <TabIcon symbol="▤" color={color} /> }} />
      <Tabs.Screen name="track" options={{ title: "Track", tabBarIcon: ({ color }) => <TabIcon symbol="●" color={color} /> }} />
      <Tabs.Screen name="activity" options={{ title: "Activity", tabBarIcon: ({ color }) => <TabIcon symbol="≡" color={color} /> }} />
      <Tabs.Screen name="coach" options={{ title: "Coach", tabBarIcon: ({ color }) => <TabIcon symbol="◎" color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.predawn,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  avatarInitial: { fontFamily: fonts.bodyBold, fontSize: 12, color: "#fff" },
});
