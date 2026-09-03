import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useAuth } from "../lib/auth/AuthContext";
import { supabase } from "../lib/supabase";
import { deleteGoal } from "../lib/data/goals";
import { useActivePlanData } from "../lib/data/usePlanData";
import { colors, fonts, spacing, type } from "../lib/theme";
import { Card } from "../components/ui/Card";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { ChipSelect } from "../components/ui/ChipSelect";
import { TextField } from "../components/ui/TextField";
import { formatDistance } from "../lib/units";

const UNIT_OPTIONS = [
  { value: "km" as const, label: "Kilometers" },
  { value: "mi" as const, label: "Miles" },
];

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

function formatMemberSince(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function Settings() {
  const router = useRouter();
  const { profile, refreshProfile, refreshActiveGoal } = useAuth();
  const { goal, reload } = useActivePlanData();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingUnit, setSavingUnit] = useState(false);

  const [name, setName] = useState(profile?.full_name ?? "");
  const [savingName, setSavingName] = useState(false);

  const [username, setUsername] = useState(profile?.username ?? "");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

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
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
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
        {!!usernameError && <Text style={styles.errorText}>{usernameError}</Text>}
        {usernameDirty && (
          <View style={styles.inlineSave}>
            <PrimaryButton label="Save username" onPress={handleSaveUsername} loading={savingUsername} />
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{profile?.email}</Text>
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
          <Text style={styles.comingSoon}>Coming soon</Text>
        </View>
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
          <Text style={styles.comingSoon}>Coming soon</Text>
        </View>
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
              <PrimaryButton
                label="Delete current plan"
                variant="secondary"
                onPress={() => setConfirmingDelete(true)}
              />
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

const styles = StyleSheet.create({
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
  divider: { height: 1, backgroundColor: colors.cardLine, marginVertical: 12 },
  inlineSave: { marginTop: 10 },
  errorText: { fontFamily: fonts.body, fontSize: 12.5, color: "#B3261E", marginTop: 6 },
  memberSince: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginTop: 12 },
  planLine: { fontFamily: fonts.bodySemiBold, fontSize: type.pDim, color: colors.textPrimary, marginBottom: 8 },
  warningText: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginBottom: 12 },
  confirmText: { fontFamily: fonts.bodySemiBold, fontSize: type.pDim, color: "#B3261E" },
});
