import { useEffect, useRef, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Animated, Pressable, View, type ColorValue, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { fonts, text, palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme/ThemeContext";
import { useReducedMotion } from "../../lib/useReducedMotion";

type IoniconName = keyof typeof Ionicons.glyphMap;

// Same transform-only press feedback as PrimaryButton/ChipSelect - a tab
// tap should feel just as immediate as any other button in the app.
const PRESS_IN = { toValue: 0.86, useNativeDriver: true, speed: 60, bounciness: 0 };
const PRESS_OUT = { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 10 };

// Overrides the default tab-bar button (which has no press feedback of its
// own) via React Navigation's `tabBarButton` escape hatch. Spreads every other
// prop straight through (href, role, accessibility state, etc.) - this wrapper
// only ever *adds* the press animation.
interface TabBarButtonProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPressIn?: ((e: GestureResponderEvent) => void) | null;
  onPressOut?: ((e: GestureResponderEvent) => void) | null;
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
      <Animated.View style={{ flex: 1, alignItems: "center", justifyContent: "center", transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

// Line icons in both states, as in the design: the active tab is told apart by
// the violet colour and a heavier label, not by a filled glyph. On top of that,
// the active icon pops up with a spring and a soft pill grows in behind it, so
// switching tabs feels alive. Transform and opacity only (native driver).
function TabIcon({ name, color, focused }: { name: IoniconName; color: ColorValue; focused: boolean }) {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    // With "reduce motion" on, the active tab just takes its look (pill and colour) with no pop, lift or spring.
    if (reduceMotion) {
      progress.setValue(focused ? 1 : 0);
      return;
    }
    Animated.spring(progress, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 16, bounciness: 12 }).start();
  }, [focused, progress, reduceMotion]);
  const pillScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const pillOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] });
  const iconScale = progress.interpolate({ inputRange: [0, 1], outputRange: reduceMotion ? [1, 1] : [1, 1.14] });
  const iconLift = progress.interpolate({ inputRange: [0, 1], outputRange: reduceMotion ? [0, 0] : [0, -1] });
  return (
    <View style={{ width: 48, height: 24, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{ position: "absolute", width: 48, height: 24, borderRadius: 12, backgroundColor: color, opacity: pillOpacity, transform: [{ scale: pillScale }] }}
      />
      <Animated.View style={{ transform: [{ translateY: iconLift }, { scale: iconScale }] }}>
        <Ionicons name={name} size={22} color={color} />
      </Animated.View>
    </View>
  );
}

function icon(name: IoniconName) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => <TabIcon name={name} color={color} focused={focused} />;
}

/**
 * Five equal tabs - Home, Plan, Track, Activity, Coach - with no raised centre
 * button and no navigator header (each tab draws its own TabHeader). Track keeps
 * the tab bar but is always dark, so its bar is dark too.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarBottom = Math.max(insets.bottom, 8);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.textDim,
        tabBarButton: (props) => <AnimatedTabButton {...props} />,
        tabBarStyle: { height: 60 + tabBarBottom, paddingTop: 6, paddingBottom: tabBarBottom, backgroundColor: colors.tabBarBg, borderTopColor: colors.cardLine },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, ...text("micro"), marginTop: 2 },
        // The five labels share a fixed-width bar; letting them follow a large system font
        // pushed them into each other, so they hold their size (icons and names stay legible).
        tabBarAllowFontScaling: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home-outline") }} />
      <Tabs.Screen name="plan" options={{ title: "Plan", tabBarIcon: icon("calendar-outline") }} />
      <Tabs.Screen
        name="track"
        options={{
          title: "Track",
          tabBarIcon: icon("play-outline"),
          // Always dark, like the screen itself.
          tabBarActiveTintColor: palette.accentGlow,
          tabBarInactiveTintColor: "#B3B6C4",
          tabBarStyle: { height: 60 + tabBarBottom, paddingTop: 6, paddingBottom: tabBarBottom, backgroundColor: "#0F1220", borderTopColor: "rgba(255,255,255,0.09)" },
        }}
      />
      <Tabs.Screen name="activity" options={{ title: "Activity", tabBarIcon: icon("bar-chart-outline") }} />
      <Tabs.Screen name="coach" options={{ title: "Coach", tabBarIcon: icon("chatbox-outline") }} />
    </Tabs>
  );
}
