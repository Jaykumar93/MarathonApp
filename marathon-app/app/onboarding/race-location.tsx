import React, { useState } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingStepLayout } from "../../components/OnboardingStepLayout";
import { TextField } from "../../components/ui/TextField";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { geocodeCity } from "../../lib/weather/openMeteo";
import { fonts, palette } from "../../lib/theme";

export default function RaceLocation() {
  const router = useRouter();
  const { answers, update } = useOnboarding();
  const [city, setCity] = useState(answers.raceLocationName ?? "");
  const [geocoding, setGeocoding] = useState(false);
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
      subtitle="Optional - only used to show a race-day weather forecast. Skip and add it later from Edit Plan."
      onNext={commitAndGo}
      onSkip={() => router.push("/onboarding/health-data")}
      nextLoading={geocoding}
    >
      <TextField label="City" value={city} onChangeText={setCity} placeholder="e.g. Chicago, IL" />
      {error && <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: palette.danger }}>{error}</Text>}
    </OnboardingStepLayout>
  );
}
