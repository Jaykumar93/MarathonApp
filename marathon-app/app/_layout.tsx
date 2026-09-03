import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts as useSpaceGrotesk,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import {
  useFonts as usePlusJakarta,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import {
  useFonts as useJetBrainsMono,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from "@expo-google-fonts/jetbrains-mono";
import { AuthProvider, useAuth } from "../lib/auth/AuthContext";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [spaceGroteskLoaded] = useSpaceGrotesk({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  const [plusJakartaLoaded] = usePlusJakarta({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  const [jetBrainsMonoLoaded] = useJetBrainsMono({
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  });

  const fontsReady = spaceGroteskLoaded && plusJakartaLoaded && jetBrainsMonoLoaded;

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

/**
 * Auth-gated redirect: not signed in -> (auth); signed in but not approved
 * -> /waitlist; approved -> (tabs) by default.
 *
 * Deliberately NOT forced into onboarding just because hasActiveGoal is
 * false - onboarding/plan creation is optional and user-initiated (a
 * "Create your plan" prompt on Home, or reachable any time from Settings),
 * not a mandatory gate blocking the rest of the app. "onboarding" and
 * "settings" are both legitimate destinations an approved user can be
 * sitting in - the redirect only fires to pull an approved user OUT of
 * somewhere they shouldn't be (auth/waitlist), never to force them INTO
 * onboarding specifically.
 *
 * hasActiveGoal lives in AuthContext (not local state) so the onboarding
 * completion handler can call refreshActiveGoal() and have this effect
 * react to the update, instead of racing a manual navigation against
 * stale local state.
 */
function AuthGate() {
  const { session, profile, loading, hasActiveGoal } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading || hasActiveGoal === null) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inTabsGroup = segments[0] === "(tabs)";
    const inOnboarding = segments[0] === "onboarding";
    const inWaitlist = segments[0] === "waitlist";
    const inSettings = segments[0] === "settings";
    const inEditPlan = segments[0] === "edit-plan";
    const inLogActivity = segments[0] === "log-activity";
    const inRunSummary = segments[0] === "run-summary";
    const inActiveRun = segments[0] === "active-run";

    if (!session) {
      if (!inAuthGroup) router.replace("/sign-in");
      return;
    }

    if (profile && profile.status !== "approved") {
      if (!inWaitlist) router.replace("/waitlist");
      return;
    }

    if (
      profile?.status === "approved" &&
      !inTabsGroup &&
      !inOnboarding &&
      !inSettings &&
      !inEditPlan &&
      !inLogActivity &&
      !inRunSummary &&
      !inActiveRun
    ) {
      router.replace("/(tabs)");
    }
  }, [session, profile, hasActiveGoal, segments]);

  if (loading || hasActiveGoal === null) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="waitlist" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="settings" options={{ presentation: "card" }} />
      <Stack.Screen name="edit-plan" options={{ presentation: "card" }} />
      <Stack.Screen name="log-activity" options={{ presentation: "card" }} />
      <Stack.Screen name="run-summary" options={{ presentation: "card" }} />
      <Stack.Screen name="active-run" options={{ presentation: "fullScreenModal" }} />
    </Stack>
  );
}
