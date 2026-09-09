import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth/AuthContext";
import { fonts, spacing, type } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "../components/ui/Card";

const THIRD_PARTIES: { name: string; gets: string; why: string }[] = [
  { name: "Supabase", gets: "Everything in this policy - it's our database, auth, and file storage provider", why: "Hosts the app's entire backend" },
  { name: "Google", gets: "Your email/name if you sign in with Google; map tiles and location while viewing a live route; Health Connect data if connected", why: "Sign-in, maps, health sync" },
  { name: "Google Gemini", gets: "Your AI coach question, plus the specific training data needed to answer it", why: "Generates the coach's reply (primary)" },
  { name: "Groq", gets: "The same, only if Gemini is unavailable", why: "Generates the coach's reply (backup)" },
  { name: "Hugging Face", gets: "The text of your coach question (not your training data)", why: "Turns your question into a search vector" },
  { name: "Expo", gets: "Your push token", why: "Delivers push notifications" },
  { name: "Open-Meteo", gets: "Race location coordinates only, no account info", why: "Race-day weather forecast" },
  { name: "Sentry", gets: "Device/OS info and crash stack traces, once configured", why: "Crash reporting" },
];

/**
 * Mirrors docs/privacy-policy.md - that's the canonical copy (easier to
 * read/review/link to on GitHub); this is the in-app version so a real user
 * can actually reach it without needing external hosting, which is what
 * MAIN_PLAN.md's pre-launch checklist flagged as missing ("the
 * permission-disclosure strings in app.json are not a substitute"). Keep
 * both in sync if either changes - there's no shared-content loader here on
 * purpose, this is a static legal document that changes rarely enough that
 * a build step for it isn't worth it.
 */
export default function PrivacyPolicy() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  function goBack() {
    // No session means this was reached from sign-up, before any account
    // exists - falling back to /settings there would just bounce straight
    // back to /sign-in anyway (AuthGate), so go there directly instead.
    if (router.canGoBack()) router.back();
    else router.replace(session ? "/settings" : "/sign-in");
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.container, { paddingTop: 24 + insets.top }]}>
      <View style={styles.topRow}>
        <Pressable onPress={goBack} hitSlop={10}>
          <Text style={styles.backLink}>‹ Back</Text>
        </Pressable>
      </View>
      <Text style={styles.header}>Privacy Policy</Text>
      <Text style={styles.effectiveDate}>Effective date: September 9, 2026</Text>
      <Text style={styles.intro}>
        Stryde is built and run by a single independent developer, currently in a manually-approved early-access
        phase. This describes what the app actually collects and where it goes - not a generic template.
      </Text>

      <Text style={styles.sectionLabel}>WHAT WE COLLECT</Text>
      <Card>
        <Text style={styles.body}>
          Account info (email, name, username - your password is handled entirely by Supabase Auth, the app never
          sees it), the training data you enter, every activity you log (manual, GPS-tracked, or auto-synced from
          Health Connect), up to 3 optional photos per activity, GPS location while a run is actively being
          tracked, your AI coach conversations, a push notification token and timezone if you enable notifications,
          gear/shoe mileage if you track it, and crash reports once error tracking is configured.
        </Text>
      </Card>

      <Text style={styles.sectionLabel}>WHY WE COLLECT IT</Text>
      <Card>
        <Text style={styles.body}>
          To generate and adjust your training plan, record your training history, power the AI coach's answers
          about your own training, sync with Health Connect if you choose to, and send the daily reminder if you
          enable it. Your data is never sold and never used for advertising - there is no advertising in this app.
        </Text>
      </Card>

      <Text style={styles.sectionLabel}>THIRD PARTIES</Text>
      <Card>
        <Text style={[styles.body, { marginBottom: 10 }]}>
          Running the app means sending some data to a small number of providers, each doing one specific job:
        </Text>
        {THIRD_PARTIES.map((p, i) => (
          <View key={p.name} style={[styles.providerRow, i === THIRD_PARTIES.length - 1 && { marginBottom: 0 }]}>
            <Text style={styles.providerName}>{p.name}</Text>
            <Text style={styles.providerGets}>{p.gets}</Text>
            <Text style={styles.providerWhy}>{p.why}</Text>
          </View>
        ))}
        <Text style={[styles.body, { marginTop: 4 }]}>
          None of them receive your password, and none are permitted to use your data beyond the job listed above.
        </Text>
      </Card>

      <Text style={styles.sectionLabel}>PHOTOS ARE STORED PUBLICLY</Text>
      <Card>
        <Text style={styles.body}>
          Activity photos are kept somewhere anyone with the exact URL could open - unlike everything else you
          store, there's no per-user access check on that link. This is what lets a photo just work everywhere it's
          shown, and was judged an acceptable tradeoff since a running photo isn't as sensitive as your location
          history or training plan. If you'd rather not, don't attach a photo to a logged activity.
        </Text>
      </Card>

      <Text style={styles.sectionLabel}>YOUR DATA IS ISOLATED FROM OTHER USERS</Text>
      <Card>
        <Text style={styles.body}>
          Every table in the database enforces row-level security - the backend itself refuses to return another
          user's rows to you, enforced independently of anything the app's own code does or doesn't check.
        </Text>
      </Card>

      <Text style={styles.sectionLabel}>RETENTION & DELETION</Text>
      <Card>
        <Text style={styles.body}>
          Kept for as long as your account is active. There's no self-serve delete button yet - email the address
          below to request deletion of your account and everything tied to it, and we'll confirm once it's done.
        </Text>
      </Card>

      <Text style={styles.sectionLabel}>CHILDREN'S PRIVACY</Text>
      <Card>
        <Text style={styles.body}>
          Stryde is not directed at, and is not knowingly used by, children under 13. Contact us if you believe a
          child has created an account and we'll remove it.
        </Text>
      </Card>

      <Text style={styles.sectionLabel}>CHANGES & CONTACT</Text>
      <Card>
        <Text style={styles.body}>
          If what the app does changes in a way that affects this policy, this page and its effective date will
          change too. Built and operated by one person - for any question, or to request deletion, email{" "}
          <Text style={styles.emailLink}>jaykumarpokar9@gmail.com</Text>.
        </Text>
      </Card>
    </ScrollView>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    container: { padding: spacing.screenPadding, paddingBottom: 40 },
    topRow: { marginBottom: 10 },
    backLink: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textDim },
    header: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary, marginBottom: 4 },
    effectiveDate: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, marginBottom: 12 },
    intro: { fontFamily: fonts.body, fontSize: type.pDim, color: colors.textDim, marginBottom: 20, lineHeight: 17 },
    sectionLabel: {
      fontFamily: fonts.bodySemiBold,
      fontSize: type.sectionLabel,
      letterSpacing: 0.6,
      color: colors.textFaint,
      marginBottom: 8,
      marginTop: 4,
    },
    body: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textDim, lineHeight: 20 },
    providerRow: { marginBottom: 12 },
    providerName: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textPrimary },
    providerGets: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textDim, marginTop: 1, lineHeight: 17 },
    providerWhy: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.textFaint, marginTop: 3 },
    emailLink: { fontFamily: fonts.bodySemiBold, color: colors.accent },
  });
}
