import { Tabs } from "expo-router";
import { ColorValue, Text } from "react-native";
import { colors, fonts } from "../../lib/theme";

function TabIcon({ symbol, color }: { symbol: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{symbol}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
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
