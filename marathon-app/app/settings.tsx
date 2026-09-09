import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useAuth } from "../lib/auth/AuthContext";
import { supabase } from "../lib/supabase";
import { deleteGoal } from "../lib/data/goals";
import { useActivePlanData } from "../lib/data/usePlanData";
import { fonts, palette, spacing, type } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "../components/ui/Card";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { ChipSelect } from "../components/ui/ChipSelect";
import { TextField } from "../components/ui/TextField";
import { Dropdown } from "../components/ui/Dropdown";
import { formatDistance } from "../lib/units";
import { healthConnectProvider } from "../lib/health/healthConnectProvider";
import { syncHealthActivities } from "../lib/health/syncHealthData";

const UNIT_OPTIONS = [
  { value: "km" as const, label: "Kilometers" },
  { value: "mi" as const, label: "Miles" },
];

const VOICE_INTERVAL_PRESETS = [1, 2, 5, 10];

function formatHour12(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${period}`;
}

// Every hour, not just a handful of morning presets - a run (and this
// message about it) isn't only a morning thing.
const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);
const NOTIFICATION_HOUR_OPTIONS = ALL_HOURS.map((hour) => ({ value: hour, label: formatHour12(hour) }));

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

function formatMemberSince(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile, refreshActiveGoal } = useAuth();
  const { mode, colors, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { goal, reload } = useActivePlanData();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingUnit, setSavingUnit] = useState(false);
  // Same capability-driven check as onboarding's health-data step.
  const [healthConnectAvailable, setHealthConnectAvailable] = useState(false);
  const [connectingHealth, setConnectingHealth] = useState(false);
  const [healthSyncError, setHealthSyncError] = useState<string | null>(null);
  const [healthSyncStatus, setHealthSyncStatus] = useState<string | null>(null);

  useEffect(() => {
    healthConnectProvider.isAvailable().then(setHealthConnectAvailable);
  }, []);

  const [name, setName] = useState(profile?.full_name ?? "");
  const [savingName, setSavingName] = useState(false);

  const [username, setUsername] = useState(profile?.username ?? "");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [savingVoiceToggle, setSavingVoiceToggle] = useState(false);
  const [savingNotificationToggle, setSavingNotificationToggle] = useState(false);
  const [savingNotificationHour, setSavingNotificationHour] = useState(false);
  const [customInterval, setCustomInterval] = useState("");
  const [savingInterval, setSavingInterval] = useState(false);

  // Keep local edit fields in sync if the profile refreshes from elsewhere.
  useEffect(() => {
    setName(profile?.full_name ?? "");
  }, [profile?.full_name]);
  useEffect(() => {
    setUsername(profile?.username ?? "");
  }, [profile?.username]);

  const nameDirty = name.trim() !== (profile?.full_name ?? "");
  const usernameDirty = username.trim().toLowerCase() !== (profile?.username ?? "");

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  async function handleDeletePlan() {
    if (!goal) return;
    setDeleting(true);
    await deleteGoal(goal.id);
    await reload();
    await refreshActiveGoal();
    setDeleting(false);
    setConfirmingDelete(false);
  }

  async function handleUnitChange(unit: "km" | "mi") {
    if (!profile) return;
    setSavingUnit(true);
    await supabase.from("profiles").update({ distance_unit: unit }).eq("id", profile.id);
    await refreshProfile();
    setSavingUnit(false);
  }

  /**
   * Permission grant + initial sync in one tap - Health Connect has no
   * separate "just connect, sync later" step worth exposing, and this
   * screen has nowhere else a background sync could be triggered from
   * (push notifications now exist, but only for the daily motivation
   * message - nothing triggers a Health Connect sync). Re-tappable
   * afterward too (see the Pressable below) to re-run the same check +
   * sync on demand.
   */
  async function handleConnectHealthConnect() {
    if (!profile) return;
    setConnectingHealth(true);
    setHealthSyncError(null);
    setHealthSyncStatus(null);
    try {
      const granted = await healthConnectProvider.requestPermissions();
      if (!granted) {
        setHealthSyncError("Permission wasn't granted - allow Stryde access from Health Connect's own app settings.");
        return;
      }
      const result = await syncHealthActivities(profile.id, healthConnectProvider);
      setHealthSyncStatus(
        result.imported > 0
          ? `Synced ${result.imported} new run${result.imported === 1 ? "" : "s"}${result.skipped > 0 ? ` (${result.skipped} already up to date)` : ""}.`
          : "No new running activities found in Health Connect."
      );
      await supabase.from("profiles").update({ health_data_source: "health_connect" }).eq("id", profile.id);
      await refreshProfile();
    } catch (e) {
      setHealthSyncError(e instanceof Error ? e.message : "Couldn't connect to Health Connect.");
    } finally {
      setConnectingHealth(false);
    }
  }

  /**
   * Only ever flips this app's own "connected" flag back off, so syncing
   * stops and the row reads "Connect" again - deliberately doesn't call
   * Health Connect's revokeAllPermissions(). Its own docs advise against
   * using it as an in-app disconnect toggle in the first place (the
   * revocation only actually applies after a full app restart, so an
   * in-app toggle would silently lie about its own effect until then) and
   * recommend exactly this: track the disconnected state locally, send the
   * user to Health Connect's own settings if they want to actually revoke
   * access. openHealthConnectSettings() takes them straight there.
   */
  async function handleDisconnectHealthConnect() {
    if (!profile) return;
    Alert.alert(
      "Disconnect Health Connect?",
      "Stryde will stop auto-syncing runs from Health Connect. Runs already imported stay in your history. To fully revoke Stryde's access to Health Connect itself, use Health Connect's own app settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setHealthSyncError(null);
            setHealthSyncStatus(null);
            await supabase.from("profiles").update({ health_data_source: "manual" }).eq("id", profile.id);
            await refreshProfile();
          },
        },
      ]
    );
  }

  async function handleVoiceToggle(enabled: boolean) {
    if (!profile) return;
    setSavingVoiceToggle(true);
    await supabase.from("profiles").update({ voice_coaching_enabled: enabled }).eq("id", profile.id);
    await refreshProfile();
    setSavingVoiceToggle(false);
  }

  async function handleIntervalChange(km: number) {
    if (!profile || km <= 0) return;
    setSavingInterval(true);
    await supabase.from("profiles").update({ voice_announcement_interval_km: km }).eq("id", profile.id);
    await refreshProfile();
    setSavingInterval(false);
  }

  async function handleDailyNotificationToggle(enabled: boolean) {
    if (!profile) return;
    setSavingNotificationToggle(true);
    await supabase.from("profiles").update({ daily_notification_enabled: enabled }).eq("id", profile.id);
    await refreshProfile();
    setSavingNotificationToggle(false);
  }

  async function handleNotificationHourChange(hour: number) {
    if (!profile) return;
    setSavingNotificationHour(true);
    await supabase.from("profiles").update({ notification_hour_local: hour }).eq("id", profile.id);
    await refreshProfile();
    setSavingNotificationHour(false);
  }

  async function handleSaveName() {
    if (!profile || !name.trim()) return;
    setSavingName(true);
    await supabase.from("profiles").update({ full_name: name.trim() }).eq("id", profile.id);
    await refreshProfile();
    setSavingName(false);
  }

  async function handleSaveUsername() {
    if (!profile) return;
    const trimmed = username.trim().toLowerCase();
    setUsernameError(null);
    if (trimmed && !USERNAME_PATTERN.test(trimmed)) {
      setUsernameError("3-20 characters: lowercase letters, numbers, underscore only.");
      return;
    }
    setSavingUsername(true);
    const { error } = await supabase
      .from("profiles")
      .update({ username: trimmed || null })
      .eq("id", profile.id);
    if (error) {
      setUsernameError(error.code === "23505" ? "That username is already taken." : "Couldn't save username.");
    } else {
      await refreshProfile();
    }
    setSavingUsername(false);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.container, { paddingTop: 24 + insets.top }]}>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.replace("/(tabs)")} hitSlop={10}>
          <Text style={styles.homeLink}>‹ Home</Text>
        </Pressable>
      </View>
      <Text style={styles.header}>Profile & Settings</Text>

      <Text style={styles.sectionLabel}>PROFILE</Text>
      <Card>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
        {nameDirty && (
          <View style={styles.inlineSave}>
            <PrimaryButton label="Save name" onPress={handleSaveName} loading={savingName} disabled={!name.trim()} />
          </View>
        )}

        <View style={styles.divider} />

        <TextField
          label="Username"
          value={username}
          onChangeText={(t) => {
            setUsername(t);
            setUsernameError(null);
          }}
          placeholder="e.g. jay_runs"
        />
        {!!usernameError && (
          <Text style={styles.errorText} accessibilityLiveRegion="polite">
            {usernameError}
          </Text>
        )}
        {usernameDirty && (
          <View style={styles.inlineSave}>
            <PrimaryButton label="Save username" onPress={handleSaveUsername} loading={savingUsername} />
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.label}>Email</Text>
          <Text style={[styles.value, { flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">
            {profile?.email}
          </Text>
        </View>
        <Text style={styles.memberSince}>Member since {formatMemberSince(profile?.created_at)}</Text>
      </Card>

      <Text style={styles.sectionLabel}>APP CONNECTIONS</Text>
      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Health Connect</Text>
            <Text style={styles.subLabel}>Auto-sync runs from Android</Text>
          </View>
          {!healthConnectAvailable ? (
            <Text style={styles.comingSoon}>Coming soon</Text>
          ) : profile?.health_data_source === "health_connect" ? (
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              {/* Still tappable, not just a static label - re-runs the same
                  permission check + sync. Needed because "Connected" reflects
                  what got saved at connect time, which can go stale (a
                  permission revoked later, or - confirmed on a real device -
                  Health Connect's own request call reporting success when the
                  OS hadn't actually granted it) with no other way to retry
                  once this no longer shows the plain Connect button. */}
              <Pressable onPress={handleConnectHealthConnect} disabled={connectingHealth} hitSlop={8}>
                <Text style={styles.connectedLabel}>{connectingHealth ? "Syncing…" : "Connected · Sync now"}</Text>
              </Pressable>
              <Pressable onPress={handleDisconnectHealthConnect} hitSlop={8}>
                <Text style={styles.disconnectLink}>Disconnect</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={handleConnectHealthConnect} disabled={connectingHealth} hitSlop={8}>
              <Text style={styles.connectLink}>{connectingHealth ? "Connecting…" : "Connect"}</Text>
            </Pressable>
          )}
        </View>
        {!!healthSyncError && <Text style={styles.errorText}>{healthSyncError}</Text>}
        {!!healthSyncStatus && <Text style={styles.subLabel}>{healthSyncStatus}</Text>}
      </Card>

      <Text style={styles.sectionLabel}>GEAR</Text>
      <Card>
        <Pressable style={styles.row} onPress={() => router.push("/gear")}>
          <Text style={styles.label}>Shoes</Text>
          <Text style={styles.connectLink}>Manage ›</Text>
        </Pressable>
      </Card>

      <Text style={styles.sectionLabel}>PREFERENCES</Text>
      <Card>
        <Text style={styles.label}>Distance unit</Text>
        <View style={{ marginTop: 8, opacity: savingUnit ? 0.5 : 1 }}>
          <ChipSelect options={UNIT_OPTIONS} value={profile?.distance_unit} onChange={handleUnitChange} />
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.label}>Dark mode</Text>
          <Switch
            value={mode === "dark"}
            onValueChange={(dark) => setMode(dark ? "dark" : "light")}
            trackColor={{ false: colors.cardLine, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Voice coaching</Text>
            <Text style={styles.subLabel}>Hear distance, time, and pace called out during a tracked run</Text>
          </View>
          <Switch
            value={profile?.voice_coaching_enabled ?? false}
            onValueChange={handleVoiceToggle}
            disabled={savingVoiceToggle}
            trackColor={{ false: colors.cardLine, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>

        {profile?.voice_coaching_enabled && (
          <View style={[styles.fieldGap, { opacity: savingInterval ? 0.5 : 1 }]}>
            <Text style={styles.label}>Announce every</Text>
            <View style={{ marginTop: 8 }}>
              <ChipSelect
                options={VOICE_INTERVAL_PRESETS.map((km) => ({ value: km, label: `${km}km` }))}
                value={
                  VOICE_INTERVAL_PRESETS.includes(profile.voice_announcement_interval_km)
                    ? profile.voice_announcement_interval_km
                    : undefined
                }
                onChange={handleIntervalChange}
              />
            </View>
            <View style={styles.fieldGap}>
              <TextField
                label="Or a custom interval (km)"
                value={customInterval}
                onChangeText={(t) => {
                  setCustomInterval(t);
                  const n = parseFloat(t);
                  if (!Number.isNaN(n) && n > 0) handleIntervalChange(n);
                }}
                keyboardType="decimal-pad"
                placeholder={`e.g. 3 (currently ${profile.voice_announcement_interval_km}km)`}
              />
            </View>
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Daily notification</Text>
            <Text style={styles.subLabel}>A personalized morning message about today's run (and a nudge if you missed one)</Text>
          </View>
          <Switch
            value={profile?.daily_notification_enabled ?? false}
            onValueChange={handleDailyNotificationToggle}
            disabled={savingNotificationToggle}
            trackColor={{ false: colors.cardLine, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>

        {profile?.daily_notification_enabled && (
          <View style={[styles.fieldGap, { opacity: savingNotificationHour ? 0.5 : 1 }]}>
            <Text style={styles.label}>Send at</Text>
            <View style={{ marginTop: 8 }}>
              <Dropdown
                options={NOTIFICATION_HOUR_OPTIONS}
                value={profile.notification_hour_local}
                onSelect={handleNotificationHourChange}
              />
            </View>
          </View>
        )}
      </Card>

      {goal && (
        <>
          <Text style={styles.sectionLabel}>CURRENT PLAN</Text>
          <Card>
            <Text style={styles.planLine}>
              {formatDistance(goal.race_distance_km, profile?.distance_unit ?? "km")} goal · race day{" "}
              {goal.goal_date}
            </Text>
            <Text style={styles.warningText}>
              Deleting your plan is permanent - it can't be undone, only replaced by setting up a new
              goal. Your training history stays intact either way.
            </Text>
            {!confirmingDelete ? (
              <View style={{ gap: 10 }}>
                <PrimaryButton label="Edit plan" onPress={() => router.push("/edit-plan")} />
                <PrimaryButton
                  label="Delete current plan"
                  variant="secondary"
                  onPress={() => setConfirmingDelete(true)}
                />
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <Text style={styles.confirmText}>Are you sure? This can't be undone.</Text>
                <PrimaryButton label="Yes, delete it" onPress={handleDeletePlan} loading={deleting} />
                <PrimaryButton label="Cancel" variant="secondary" onPress={() => setConfirmingDelete(false)} />
              </View>
            )}
          </Card>
        </>
      )}

      {profile?.is_admin && (
        <>
          <Text style={styles.sectionLabel}>ADMIN</Text>
          <Card>
            <PrimaryButton label="Manage waitlist" variant="secondary" onPress={() => router.push("/admin")} />
          </Card>
        </>
      )}

      <Text style={styles.sectionLabel}>ABOUT</Text>
      <Card>
        <View style={styles.row}>
          <Text style={styles.label}>Stryde version</Text>
          <Text style={styles.value}>{Constants.expoConfig?.version ?? "1.0.0"}</Text>
        </View>
      </Card>

      <View style={{ marginTop: 12 }}>
        <PrimaryButton label="Sign out" variant="secondary" onPress={handleSignOut} />
      </View>
    </ScrollView>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  container: { padding: spacing.screenPadding, paddingTop: 24 },
  topRow: { marginBottom: 10 },
  homeLink: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textDim },
  header: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary, marginBottom: 16 },
  sectionLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: type.sectionLabel,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.textFaint,
    marginTop: 4,
    marginBottom: 7,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  label: { fontFamily: fonts.bodyMedium, fontSize: type.pDim, color: colors.textDim },
  subLabel: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginTop: 2 },
  value: { fontFamily: fonts.bodySemiBold, fontSize: type.pDim, color: colors.textPrimary },
  comingSoon: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint },
  connectedLabel: { fontFamily: fonts.bodySemiBold, fontSize: type.pFaint, color: colors.success },
  connectLink: { fontFamily: fonts.bodySemiBold, fontSize: type.pFaint, color: colors.accent },
  disconnectLink: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFaint },
  divider: { height: 1, backgroundColor: colors.cardLine, marginVertical: 12 },
  fieldGap: { marginTop: 12 },
  inlineSave: { marginTop: 10 },
  errorText: { fontFamily: fonts.body, fontSize: 12.5, color: palette.danger, marginTop: 6 },
  memberSince: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginTop: 12 },
  planLine: { fontFamily: fonts.bodySemiBold, fontSize: type.pDim, color: colors.textPrimary, marginBottom: 8 },
  warningText: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginBottom: 12 },
  confirmText: { fontFamily: fonts.bodySemiBold, fontSize: type.pDim, color: palette.danger },
  });
}
