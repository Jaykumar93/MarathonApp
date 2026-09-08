import { useMemo, useRef, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { Animated, ColorValue, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { useAuth } from "../../lib/auth/AuthContext";
import { fonts, type } from "../../lib/theme";
import { useTheme, type Colors, type ThemeShadows } from "../../lib/theme/ThemeContext";
import { HealthSyncButton } from "../../components/HealthSyncButton";

type IoniconName = keyof typeof Ionicons.glyphMap;

// Same transform-only press feedback as PrimaryButton/ChipSelect - a tab
// tap should feel just as immediate as any other button in the app.
const PRESS_IN = { toValue: 0.88, useNativeDriver: true, speed: 50, bounciness: 0 };
const PRESS_OUT = { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 6 };

// Overrides the default tab-bar button (which has no press feedback of its
// own) via React Navigation's `tabBarButton` escape hatch - `tabBarIcon`
// alone only controls the icon content, not the pressable wrapper around
// the whole tab. Spreads every other prop straight through (href, role,
// accessibility state, etc.) rather than cherry-picking a subset - this
// wrapper only ever wants to *add* the press animation, never to drop
// whatever React Navigation/expo-router itself relies on to make the tab
// behave like a real link on web.
interface TabBarButtonProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPressIn?: ((e: GestureResponderEvent) => void) | null;
  onPressOut?: ((e: GestureResponderEvent) => void) | null;
  // React Navigation's real BottomTabBarButtonProps carries several more
  // fields (href, onPress, accessibilityState/Role, testID, a `ref`
  // typed against its own View, ...) that aren't worth redeclaring one by
  // one here (and whose `ref` type doesn't structurally match Pressable's
  // own) - passed through as-is via `rest` instead.
  [key: string]: unknown;
}

function AnimatedTabButton({ children, style, onPressIn, onPressOut, ...rest }: TabBarButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      {...rest}
      style={style}
      onPressIn={(e) => {
        Animated.spring(scale, PRESS_IN).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        Animated.spring(scale, PRESS_OUT).start();
        onPressOut?.(e);
      }}
    >
      <Animated.View style={{ flex: 1, alignItems: "center", justifyContent: "center", transform: [{ scale }] }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// Outline while inactive, filled on the active tab - minimal at rest,
// with the fill as the click/active signal rather than a heavier stroke.
function TabIcon({ name, focused, color }: { name: IoniconName; focused: boolean; color: ColorValue }) {
  return <Ionicons name={focused ? (name.replace("-outline", "") as IoniconName) : name} size={20} color={color} />;
}

// Track gets its own raised, circular treatment (like a camera-tab in a
// typical bottom nav) rather than sitting flush in the row like every
// other tab - it's the one screen that starts a live, full-screen
// activity (GPS tracking), so it earns a visually distinct entry point.
// A plain ring (a record/shutter-button look) rather than an Ionicon glyph
// - sidesteps the icon-font's own asymmetric glyph padding entirely (an
// actual centering problem the arrow icon had) and reads as "start
// recording" at a glance, matching what Track's screen actually does.
function RaisedTabIcon() {
  const { colors, shadows } = useTheme();
  const styles = useMemo(() => createRaisedStyles(colors, shadows), [colors, shadows]);
  return (
    <View style={styles.circle}>
      <View style={styles.ring} />
    </View>
  );
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
        tabBarButton: (props) => <AnimatedTabButton {...props} />,
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
          tabBarIcon: () => <RaisedTabIcon />,
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

function createRaisedStyles(colors: Colors, shadows: ThemeShadows) {
  return StyleSheet.create({
    circle: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: "center",
      justifyContent: "center",
      marginTop: -32, // lifts it well clear of the bar's top edge
      backgroundColor: colors.accent,
      ...shadows.card,
    },
    ring: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 3,
      borderColor: "#fff",
    },
  });
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
