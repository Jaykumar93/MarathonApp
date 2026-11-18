import React, { useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../../components/ui/Card";
import { useRouter } from "expo-router";
import { OnboardingStepLayout } from "../../components/OnboardingStepLayout";
import { TextField } from "../../components/ui/TextField";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { geocodeCity } from "../../lib/weather/openMeteo";
import { fonts, text } from "../../lib/theme";
import { useTheme } from "../../lib/theme/ThemeContext";

export default function RaceLocation() {
  const { colors } = useTheme();
  const router = useRouter();
  const { answers, update } = useOnboarding();
  const [city, setCity] = useState(answers.raceLocationName ?? "");
  const [geocoding, setGeocoding] = useState(false);
  const savedName = answers.raceLocationName;
  const [error, setError] = useState<string | null>(null);

  async function commitAndGo() {
    const trimmed = city.trim();
    if (!trimmed) {
      router.push("/onboarding/health-data");
      return;
    }
    setGeocoding(true);
    setError(null);
    const match = await geocodeCity(trimmed);
    setGeocoding(false);
    if (!match) {
      setError("Couldn't find that city - check the spelling, or skip and add it later from Edit Plan.");
      return;
    }
    update({ raceLat: match.lat, raceLon: match.lon, raceLocationName: match.displayName });
    router.push("/onboarding/health-data");
  }

  return (
    <OnboardingStepLayout
      step={5}
      title="Where's race day?"
      subtitle="Optional. Only used to show a race-day weather forecast. Add it later from Edit plan."
      onNext={commitAndGo}
      onSkip={() => router.push("/onboarding/health-data")}
      nextLoading={geocoding}
    >
      <TextField label="City" value={city} onChangeText={setCity} placeholder="e.g. Chicago, IL" />
      {savedName && city.trim().length > 0 && savedName.toLowerCase().startsWith(city.trim().toLowerCase()) && (
        <Card style={{ marginBottom: 0, flexDirection: "row", gap: 14, alignItems: "center" }}>
          <Ionicons name="location-outline" size={22} color={colors.textPrimary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.textPrimary }}>{savedName}</Text>
            <Text style={{ fontFamily: fonts.body, ...text("body"), color: colors.textDim }}>Used for your race-day forecast</Text>
          </View>
        </Card>
      )}
      {error && <Text style={{ fontFamily: fonts.body, ...text("small"), color: colors.dangerText }}>{error}</Text>}
    </OnboardingStepLayout>
  );
}
