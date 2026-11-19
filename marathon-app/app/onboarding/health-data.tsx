import React, { useEffect, useMemo, useState } from "react";
import { Platform, Text, View } from "react-native";
import { PressableScale as Pressable } from "../../components/ui/PressableScale";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { OnboardingStepLayout } from "../../components/OnboardingStepLayout";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { healthConnectProvider } from "../../lib/health/healthConnectProvider";
import { fonts, radius, text } from "../../lib/theme";
import { useTheme } from "../../lib/theme/ThemeContext";

/**
 * Step 5: how runs get into the app. This only records the preference. The plan
 * itself is built on the last step (race-date.tsx), once the race date, which
 * depends on every earlier answer, is known.
 */
export default function HealthData() {
  const { colors } = useTheme();
  const router = useRouter();
  const { answers, update } = useOnboarding();
  // Driven by the actual HealthDataProvider capability check, not a
  // hardcoded "(coming soon)" label - true once Health Connect is actually
  // installed on this device, false on iOS or on an Expo-Go/older build.
  const [healthConnectAvailable, setHealthConnectAvailable] = useState(false);

  useEffect(() => {
    healthConnectProvider.isAvailable().then(setHealthConnectAvailable);
  }, []);

  const healthConnectLabel =
    Platform.OS !== "android"
      ? "Health Connect (Android only)"
      : healthConnectAvailable
        ? "Health Connect"
        : "Health Connect (not set up on this build)";

  const healthSourceOptions = useMemo(
    () => [
      {
        value: "health_connect" as const,
        title: healthConnectLabel,
        desc: "Import runs from your watch",
        icon: "heart-outline" as const,
        disabled: !healthConnectAvailable,
      },
      { value: "manual" as const, title: "Log manually", desc: "Add runs yourself, anytime", icon: "add" as const, disabled: false },
      { value: "healthkit" as const, title: "HealthKit (iOS, coming later)", desc: "Import runs from Apple Health", icon: "heart-outline" as const, disabled: true },
    ],
    [healthConnectAvailable, healthConnectLabel]
  );
  const selectedSource = answers.healthDataSource ?? "manual";

  return (
    <OnboardingStepLayout
      step={5}
      title="Connect your health data"
      subtitle="Log manually, or connect Health Connect if it's available on this build. You can change this anytime from Settings."
      onNext={() => {
        update({ healthDataSource: selectedSource });
        router.push("/onboarding/race-date");
      }}
    >
      <View style={{ gap: 12 }}>
        {healthSourceOptions.map((o) => {
          const selected = o.value === selectedSource;
          return (
            <Pressable
              key={o.value}
              disabled={o.disabled}
              onPress={() => update({ healthDataSource: o.value })}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: o.disabled }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
                padding: 18,
                borderRadius: radius.lg,
                backgroundColor: colors.cardBg,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? colors.accentFill : colors.cardLine,
                opacity: o.disabled ? 0.5 : 1,
              }}
            >
              <Ionicons name={o.icon} size={24} color={colors.textPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: colors.textPrimary }}>{o.title}</Text>
                <Text style={{ fontFamily: fonts.body, ...text("body"), color: colors.textDim }}>{o.desc}</Text>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={22} color={colors.accentMark} />}
            </Pressable>
          );
        })}
      </View>
    </OnboardingStepLayout>
  );
}
