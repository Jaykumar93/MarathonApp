import { Tabs, useRouter } from "expo-router";
import { ColorValue, Pressable, StyleSheet, Text } from "react-native";
import { useAuth } from "../../lib/auth/AuthContext";
import { colors, fonts, type } from "../../lib/theme";

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
    <Pressable
      style={styles.avatar}
      onPress={() => router.push("/settings")}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Open profile and settings"
    >
      <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
    </Pressable>
  );
}

// Rendered as the Home tab's headerLeft - living in the exact same header
// row as ProfileButton (headerRight) is the only way to guarantee they sit
// on the same visual line, since anything placed in the scrollable content
// below is a different layout tree from the native header and will never
// reliably line up with it.
function HomeGreeting() {
  const { profile } = useAuth();
  const displayName = profile?.full_name || profile?.email?.split("@")[0] || "there";
  return (
    <Text style={styles.greeting} numberOfLines={1}>
      Good to see you, {displayName}
    </Text>
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
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          headerLeft: () => <HomeGreeting />,
          tabBarIcon: ({ color }) => <TabIcon symbol="⌂" color={color} />,
        }}
      />
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
  greeting: {
    fontFamily: fonts.bodyMedium,
    fontSize: type.pDim,
    color: colors.textDim,
    marginLeft: 18,
    maxWidth: 220,
  },
});
