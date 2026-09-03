import { Stack } from "expo-router";
import { OnboardingProvider } from "../../lib/onboarding/OnboardingContext";

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </OnboardingProvider>
  );
}
