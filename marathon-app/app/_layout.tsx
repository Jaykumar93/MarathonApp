import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Sentry from "@sentry/react-native";
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
import { RunTrackingProvider } from "../lib/runTracking/RunTrackingContext";
import { ThemeProvider } from "../lib/theme/ThemeContext";

SplashScreen.preventAutoHideAsync().catch(() => {});

// Free tier (5,000 events/month) from early access onward, per PRD §7/§8.
// No-ops entirely when EXPO_PUBLIC_SENTRY_DSN isn't set (e.g. this preview
// sandbox, or a fresh checkout before a DSN is configured) - Sentry.init()
// with an empty/undefined dsn just disables the SDK rather than throwing,
// but skipping the call outright is more explicit about why nothing is
// being reported. Called at module scope, once, before anything renders -
// same reasoning as SplashScreen.preventAutoHideAsync() above.
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({ dsn: sentryDsn, sendDefaultPii: false });
}

function RootLayoutInner() {
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
      <ThemeProvider>
        <RunTrackingProvider>
          <AuthGate />
        </RunTrackingProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

// Sentry.wrap adds an error boundary plus basic navigation/session
// instrumentation around the whole app - a no-op passthrough when
// Sentry.init() above was skipped (no DSN configured).
export default Sentry.wrap(RootLayoutInner);

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
    const inPlannedSession = segments[0] === "planned-session";
    const inShareRun = segments[0] === "share-run";
    const inActiveRun = segments[0] === "active-run";
    const inGear = segments[0] === "gear";
    const inRaceDay = segments[0] === "race-day";

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
      !inPlannedSession &&
      !inShareRun &&
      !inActiveRun &&
      !inGear &&
      !inRaceDay
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
      <Stack.Screen name="planned-session" options={{ presentation: "card" }} />
      <Stack.Screen name="share-run" options={{ presentation: "card" }} />
      <Stack.Screen name="active-run" options={{ presentation: "fullScreenModal" }} />
      <Stack.Screen name="gear" options={{ presentation: "card" }} />
      <Stack.Screen name="race-day" options={{ presentation: "card" }} />
    </Stack>
  );
}
