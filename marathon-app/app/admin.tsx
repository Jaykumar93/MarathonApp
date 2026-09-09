import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth/AuthContext";
import { getAllProfiles, setUserApproval, type AdminProfileRow } from "../lib/data/admin";
import { fonts, spacing, type } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "../components/ui/Card";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { TextField } from "../components/ui/TextField";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface PendingAction {
  userId: string;
  action: "approve" | "revoke";
}

function UserRow({
  row,
  onRequestAction,
}: {
  row: AdminProfileRow;
  onRequestAction: (userId: string, action: "approve" | "revoke") => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.userRow}>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{row.full_name || row.username || "Unnamed"}</Text>
        <Text style={styles.userEmail}>{row.email}</Text>
        <Text style={styles.userDate}>Joined {formatDate(row.created_at)}</Text>
      </View>
      {row.status === "approved" ? (
        <Pressable style={styles.revokeChip} onPress={() => onRequestAction(row.id, "revoke")}>
          <Text style={styles.revokeChipText}>Revoke</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.approveChip} onPress={() => onRequestAction(row.id, "approve")}>
          <Text style={styles.approveChipText}>Approve</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Admin-only waitlist management, reachable only via a Settings row that's
 * itself only rendered when profile.is_admin - that's a UI convenience,
 * not the real security boundary. The actual enforcement is server-side:
 * the "profiles: admin select all" RLS policy (so a non-admin hitting this
 * screen by URL just sees their own single row, same as any other
 * profiles query) and the admin-set-approval Edge Function independently
 * re-checking is_admin() before writing anything.
 */
export default function Admin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [rows, setRows] = useState<AdminProfileRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    getAllProfiles()
      .then(setRows)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load users."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/settings");
  }

  function requestAction(userId: string, action: "approve" | "revoke") {
    setPendingAction({ userId, action });
    setPassword("");
    setActionError(null);
  }

  async function confirmAction() {
    if (!pendingAction || !profile?.email) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await setUserApproval(pendingAction.userId, pendingAction.action, profile.email, password);
      setPendingAction(null);
      setPassword("");
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  // Never list the admin's own row - approving/revoking yourself here isn't
  // a real action this screen should offer (you're always already
  // approved, or you couldn't have reached this admin-gated screen at all).
  const otherRows = rows?.filter((r) => r.id !== profile?.id) ?? [];
  const pending = otherRows.filter((r) => r.status !== "approved");
  const approved = otherRows.filter((r) => r.status === "approved");

  return (
    <View style={[styles.screen, { paddingTop: 20 + insets.top }]}>
      <View style={styles.topRow}>
        <Pressable onPress={goBack} hitSlop={10}>
          <Text style={styles.backLink}>‹ Back</Text>
        </Pressable>
      </View>
      <Text style={styles.header}>Admin</Text>

      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {loadError && <Text style={styles.errorText}>{loadError}</Text>}

        <Text style={styles.sectionLabel}>PENDING ({pending.length})</Text>
        <Card>
          {pending.length === 0 ? (
            <Text style={styles.emptyText}>No pending requests.</Text>
          ) : (
            pending.map((row, i) => (
              <React.Fragment key={row.id}>
                {i > 0 && <View style={styles.divider} />}
                <UserRow row={row} onRequestAction={requestAction} />
              </React.Fragment>
            ))
          )}
        </Card>

        <Text style={styles.sectionLabel}>APPROVED ({approved.length})</Text>
        <Card>
          {approved.length === 0 ? (
            <Text style={styles.emptyText}>No approved users yet.</Text>
          ) : (
            approved.map((row, i) => (
              <React.Fragment key={row.id}>
                {i > 0 && <View style={styles.divider} />}
                <UserRow row={row} onRequestAction={requestAction} />
              </React.Fragment>
            ))
          )}
        </Card>
      </ScrollView>

      {pendingAction && (
        <View style={styles.confirmOverlay}>
          <Card style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>
              {pendingAction.action === "approve" ? "Approve this user?" : "Revoke this user's access?"}
            </Text>
            <Text style={styles.confirmBody}>Enter your password to confirm.</Text>
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoFocus
              placeholder="Your account password"
            />
            {actionError && <Text style={styles.errorText}>{actionError}</Text>}
            <View style={styles.confirmButtons}>
              <PrimaryButton
                label={pendingAction.action === "approve" ? "Approve" : "Revoke"}
                onPress={confirmAction}
                loading={submitting}
                disabled={!password}
              />
              <PrimaryButton label="Cancel" variant="secondary" onPress={() => setPendingAction(null)} disabled={submitting} />
            </View>
          </Card>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg, paddingHorizontal: spacing.screenPadding },
    topRow: { marginBottom: 10 },
    backLink: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textDim },
    header: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary, marginBottom: 16 },
    scrollFlex: { flex: 1 },
    scrollContent: { paddingBottom: 24 },
    sectionLabel: {
      fontFamily: fonts.monoMedium,
      fontSize: type.sectionLabel,
      textTransform: "uppercase",
      letterSpacing: 1,
      color: colors.textFaint,
      marginTop: 16,
      marginBottom: 7,
    },
    emptyText: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, paddingVertical: 4 },
    errorText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.danger, marginBottom: 8 },
    divider: { height: 1, backgroundColor: colors.cardLine, marginVertical: 10 },
    userRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    userInfo: { flex: 1 },
    userName: { fontFamily: fonts.bodySemiBold, fontSize: type.pDim, color: colors.textPrimary },
    userEmail: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textDim, marginTop: 2 },
    userDate: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginTop: 2 },
    approveChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.accent,
    },
    approveChipText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: "#fff" },
    revokeChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.danger,
    },
    revokeChipText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.danger },
    confirmOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.4)",
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.screenPadding,
    },
    confirmCard: {
      width: "100%",
      maxWidth: 380,
      gap: 10,
      // Card's own cardBg is deliberately translucent in dark mode (an
      // in-flow surface sitting on the already-solid screen behind it) -
      // wrong for a popup floating over a dimmed backdrop, where that
      // translucency reads as "barely there". sheetBg is the opaque
      // surface other floating overlays (Dropdown, track/coach/activity
      // sheets) already use for exactly this case.
      backgroundColor: colors.sheetBg,
      borderWidth: 0,
    },
    confirmTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.textPrimary },
    confirmBody: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textDim, marginBottom: 4 },
    confirmButtons: { gap: 8, marginTop: 6 },
  });
}
