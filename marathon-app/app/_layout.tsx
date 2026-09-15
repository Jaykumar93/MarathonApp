import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Text, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
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
import { createSessionFromUrl } from "../lib/auth/googleAuth";
import { isPasswordRecoveryUrl } from "../lib/auth/passwordReset";
import { NotificationsProvider } from "../lib/notifications/NotificationsContext";
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

  // A hung (not failed - useFonts has no error path that surfaces here)
  // font load previously left the entire app permanently blank: fontsReady
  // never became true, RootLayoutInner returned null forever below, and
  // SplashScreen.hideAsync() never ran - no crash, no console output,
  // nothing to explain why. This timeout guarantees the app still renders
  // (with system-font fallback) even if custom fonts never finish, instead
  // of a hang in a precondition blocking the entire app indefinitely.
  const [fontsTimedOut, setFontsTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFontsTimedOut(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  const fontsReady = (spaceGroteskLoaded && plusJakartaLoaded && jetBrainsMonoLoaded) || fontsTimedOut;

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  // Catches the Google OAuth redirect: on native this is a no-op (the
  // sign-in flow already exchanges its code directly - see
  // lib/auth/googleAuth.ts), but on web the redirect is a full page
  // reload, so this is the only place that sees the returned `code`. Also
  // catches the password-recovery email link, which exchanges its `code`
  // the exact same way - the only difference is a `type=recovery` param,
  // which is what tells this apart from a normal sign-in and sends it to
  // /reset-password instead of wherever AuthGate would otherwise route an
  // already-authenticated user.
  const linkingUrl = Linking.useLinkingURL();
  const rootRouter = useRouter();
  useEffect(() => {
    if (!linkingUrl) return;
    createSessionFromUrl(linkingUrl)
      .then(() => {
        if (isPasswordRecoveryUrl(linkingUrl)) rootRouter.replace("/reset-password");
      })
      .catch(() => {});
  }, [linkingUrl]);

  if (!fontsReady) return null;

  return (
    <AuthProvider>
      <NotificationsProvider>
        <ThemeProvider>
          <RunTrackingProvider>
            <AuthGate />
          </RunTrackingProvider>
        </ThemeProvider>
      </NotificationsProvider>
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
  const ready = !(loading || hasActiveGoal === null);
  const fade = useRef(new Animated.Value(0)).current;

  // TEMPORARY DIAGNOSTIC (re-added) - native dev-client specifically stayed
  // blank even after the .finally() hardening, while web renders fine on
  // the same JS - pointing at something native-only (AsyncStorage is the
  // leading suspect, since that's the one thing that differs between the
  // two platforms in this exact code path). Remove once confirmed fixed.
  const [debugSteps, setDebugSteps] = useState<string[]>(["mounted"]);
  useEffect(() => {
    const log = (s: string) => setDebugSteps((prev) => [...prev, `${s} @ ${new Date().toISOString().slice(11, 19)}`]);
    (async () => {
      log("before AsyncStorage import");
      let AsyncStorage;
      try {
        AsyncStorage = require("@react-native-async-storage/async-storage").default;
        log("AsyncStorage imported ok");
      } catch (e) {
        log(`AsyncStorage import FAILED: ${e}`);
        return;
      }
      try {
        log("before AsyncStorage.setItem");
        await AsyncStorage.setItem("__debug_test__", "1");
        log("before AsyncStorage.getItem");
        const v = await AsyncStorage.getItem("__debug_test__");
        log(`AsyncStorage roundtrip ok: ${v}`);
      } catch (e) {
        log(`AsyncStorage roundtrip FAILED: ${e}`);
      }
      try {
        log("before supabase.auth.getSession()");
        const { supabase } = require("../lib/supabase");
        const result = await supabase.auth.getSession();
        log(`getSession ok: session=${!!result.data.session}`);
      } catch (e) {
        log(`getSession FAILED: ${e}`);
      }
    })();
  }, []);

  // Splash hides as soon as fonts are ready (see RootLayoutInner above),
  // but auth/profile/goal state usually resolves a beat later - without
  // this, that gap reads as a blank white flash before the real screen
  // pops in. A short opacity fade (skipped instantly under "reduce
  // motion", per the OS accessibility setting) turns that pop into a
  // deliberate reveal instead.
  useEffect(() => {
    if (!ready) return;
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (reduceMotion) {
        fade.setValue(1);
      } else {
        Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }).start();
      }
    });
  }, [ready]);

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
    const inAdmin = segments[0] === "admin";
    const inNotifications = segments[0] === "notifications";
    // Reachable at every auth state, not just once signed in - it's linked
    // from sign-up itself ("you agree to our Privacy Policy"), before a
    // session exists at all, so the usual !inAuthGroup redirect below would
    // otherwise bounce a signed-out visitor straight back to /sign-in.
    const inPrivacyPolicy = segments[0] === "privacy-policy";
    // A recovery-code exchange (see the linking-url effect above) always
    // creates a real session before this screen is ever reached, so it
    // only ever needs exempting from the two *signed-in* checks below, not
    // the signed-out one above - unlike /privacy-policy, which is linked
    // from sign-up before any session exists at all.
    const inResetPassword = segments[0] === "reset-password";

    if (!session) {
      if (!inAuthGroup && !inPrivacyPolicy) router.replace("/sign-in");
      return;
    }

    if (profile && profile.status !== "approved") {
      // A forgotten-password reset shouldn't have to wait on waitlist
      // approval - someone can be locked out of an account that's still
      // pending review.
      if (!inWaitlist && !inPrivacyPolicy && !inResetPassword) router.replace("/waitlist");
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
      !inRaceDay &&
      !inAdmin &&
      !inNotifications &&
      !inPrivacyPolicy &&
      !inResetPassword
    ) {
      router.replace("/(tabs)");
    }
  }, [session, profile, hasActiveGoal, segments]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: "#14161A", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ color: "#FF5A1F", fontSize: 16, fontWeight: "600", marginBottom: 12 }}>DEBUG: waiting on auth</Text>
        <Text style={{ color: "#EEEFEA", fontSize: 13 }}>loading: {String(loading)}</Text>
        <Text style={{ color: "#EEEFEA", fontSize: 13 }}>hasActiveGoal: {String(hasActiveGoal)}</Text>
        <View style={{ marginTop: 16, alignItems: "flex-start" }}>
          {debugSteps.map((s, i) => (
            <Text key={i} style={{ color: "#9EA19A", fontSize: 11 }}>
              {i}. {s}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  return (
    <Animated.View style={{ flex: 1, opacity: fade }}>
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
        <Stack.Screen name="admin" options={{ presentation: "card" }} />
        <Stack.Screen name="notifications" options={{ presentation: "card" }} />
        <Stack.Screen name="privacy-policy" options={{ presentation: "card" }} />
        <Stack.Screen name="reset-password" options={{ presentation: "card" }} />
      </Stack>
    </Animated.View>
  );
}
