import { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { ColorValue, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../lib/auth/AuthContext";
import { fonts, type } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { HealthSyncButton } from "../../components/HealthSyncButton";

type IoniconName = keyof typeof Ionicons.glyphMap;

// Outline while inactive, filled on the active tab - minimal at rest,
// with the fill as the click/active signal rather than a heavier stroke.
function TabIcon({ name, focused, color }: { name: IoniconName; focused: boolean; color: ColorValue }) {
  return <Ionicons name={focused ? (name.replace("-outline", "") as IoniconName) : name} size={20} color={color} />;
}

// Profile access lives in the shared tab header (not on any one screen) so
// it's reachable from every tab - including Home/Plan when they're showing
// NoPlanPrompt instead of real plan data, since having no goal yet is a
// normal, supported state, not a reason to lose access to Settings.
function ProfileButton() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const displayName = profile?.full_name || profile?.email?.split("@")[0] || "there";
  return (
    <Text style={styles.greeting} numberOfLines={1}>
      Good to see you, {displayName}
    </Text>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTitle: "",
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.screenBg },
        headerRight: () => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <HealthSyncButton />
            <ProfileButton />
          </View>
        ),
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { height: 74, paddingTop: 9, backgroundColor: colors.tabBarBg, borderTopColor: colors.cardLine },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          headerLeft: () => <HomeGreeting />,
          tabBarIcon: ({ color, focused }) => <TabIcon name="home-outline" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: "Plan",
          tabBarIcon: ({ color, focused }) => <TabIcon name="calendar-outline" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          title: "Track",
          // Full-bleed map screen - no header, no tab bar, so there's
          // nothing to distract from tracking. The only way back to the
          // rest of the app is ending the run (active-run's Save/Discard
          // both land back on a normal tab screen, which restores these).
          headerShown: false,
          tabBarStyle: { display: "none" },
          tabBarIcon: ({ color, focused }) => <TabIcon name="navigate-outline" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarIcon: ({ color, focused }) => <TabIcon name="list-outline" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: "Coach",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="chatbubble-ellipses-outline" focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    avatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      // Was colors.predawn - identical hex to dark mode's screenBg
      // ("#14161A" both), so the circle vanished entirely against the dark
      // header. Accent is the same bright orange in both themes, so it
      // reads clearly against either background.
      backgroundColor: colors.accent,
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
}
