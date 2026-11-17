import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth/AuthContext";
import { createShoe, getShoes, retireShoe, type ShoeRow } from "../lib/data/shoes";
import { formatDistance } from "../lib/units";
import { fonts, spacing, text, radius } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "../components/ui/Card";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { TextField } from "../components/ui/TextField";
import { ScreenHeader, SCREEN_TOP_GAP, SCREEN_BOTTOM_GAP } from "../components/ui/ScreenHeader";

/**
 * Never wireframed in the PRD/design docs beyond "reuse generic list/card
 * patterns" (marathon-app-wireframes.html explicitly says so) - full
 * latitude on layout here. A flat list rather than tabs/sections: most
 * users will have a small handful of shoes, active ones first (getShoes
 * already orders retired-last), retired ones shown dimmed rather than
 * hidden entirely (their mileage history is still real training history).
 */
export default function Gear() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unit = profile?.distance_unit ?? "km";

  const [shoes, setShoes] = useState<ShoeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [startingKm, setStartingKm] = useState("");

  function reload() {
    if (!session?.user?.id) return;
    getShoes(session.user.id).then((rows) => {
      setShoes(rows);
      setLoading(false);
    });
  }

  useEffect(reload, [session?.user?.id]);

  async function handleAddShoe() {
    if (!session?.user?.id || !name.trim()) return;
    setSaving(true);
    const km = parseFloat(startingKm);
    await createShoe(session.user.id, {
      name: name.trim(),
      brand: brand.trim() || undefined,
      startingDistanceKm: !Number.isNaN(km) && km > 0 ? km : undefined,
    });
    setName("");
    setBrand("");
    setStartingKm("");
    setAdding(false);
    setSaving(false);
    reload();
  }

  async function handleToggleRetire(shoe: ShoeRow) {
    await retireShoe(shoe.id, !shoe.retired);
    reload();
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/settings");
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.container, { paddingTop: SCREEN_TOP_GAP + insets.top, paddingBottom: SCREEN_BOTTOM_GAP + insets.bottom }]}>
      <ScreenHeader
        title="Gear"
        onBack={goBack}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Add a shoe" onPress={() => setAdding(true)} hitSlop={8}>
            <Ionicons name="add" size={26} color={colors.textPrimary} />
          </Pressable>
        }
      />
      <Text style={styles.subtitle}>Track shoe mileage - a nudge shows once a shoe passes its retirement distance.</Text>

      {!loading &&
        shoes.map((shoe) => {
          const overThreshold = shoe.cumulative_distance_km >= shoe.retirement_threshold_km;
          const progress = Math.min(1, shoe.cumulative_distance_km / shoe.retirement_threshold_km);
          return (
            <Card key={shoe.id} style={shoe.retired ? styles.retiredCard : undefined}>
              <View style={styles.shoeRow}>
                <Ionicons name="footsteps-outline" size={22} color={colors.textPrimary} style={styles.shoeIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.shoeName, shoe.retired && styles.retiredText]}>{shoe.name}</Text>
                  {!!shoe.brand && <Text style={[styles.shoeBrand, shoe.retired && styles.retiredText]}>{shoe.brand}</Text>}
                  <Text style={[styles.mileageText, overThreshold && !shoe.retired && styles.mileageTextWarning]}>
                    {shoe.retired
                      ? `Retired · ${formatDistance(shoe.cumulative_distance_km, unit)}`
                      : `${formatDistance(shoe.cumulative_distance_km, unit)} of ${formatDistance(shoe.retirement_threshold_km, unit)}`}
                  </Text>
                </View>
                {!shoe.retired && (
                  <View style={[styles.statusPill, overThreshold ? styles.statusWarn : progress >= 0.85 ? styles.statusWarn : styles.statusGood]}>
                    <Text style={[styles.statusText, overThreshold || progress >= 0.85 ? styles.statusTextWarn : styles.statusTextGood]}>
                      {overThreshold ? "PAST DUE" : progress >= 0.85 ? "NEARLY DONE" : "GOOD"}
                    </Text>
                  </View>
                )}
              </View>

              {!shoe.retired && (
                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressFill, { width: `${progress * 100}%` }, (overThreshold || progress >= 0.85) && styles.progressFillOver]}
                  />
                </View>
              )}
              <Pressable accessibilityRole="button" onPress={() => handleToggleRetire(shoe)} hitSlop={8} style={styles.retireWrap}>
                <Text style={styles.retireLink}>{shoe.retired ? "Un-retire" : "Retire"}</Text>
              </Pressable>
            </Card>
          );
        })}

      {!loading && shoes.length === 0 && !adding && (
        <Text style={styles.emptyText}>No shoes added yet.</Text>
      )}

      {adding ? (
        <Card>
          <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Pegasus 41" />
          <View style={styles.fieldGap}>
            <TextField label="Brand (optional)" value={brand} onChangeText={setBrand} placeholder="e.g. Nike" />
          </View>
          <View style={styles.fieldGap}>
            <TextField
              label="Starting mileage, km (optional)"
              value={startingKm}
              onChangeText={setStartingKm}
              keyboardType="decimal-pad"
              placeholder="If you've already run in these"
            />
          </View>
          <View style={styles.addActions}>
            <View style={{ flex: 1 }}>
              <PrimaryButton label="Cancel" variant="secondary" onPress={() => setAdding(false)} disabled={saving} />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton label={saving ? "Adding…" : "Add shoe"} onPress={handleAddShoe} disabled={saving || !name.trim()} />
            </View>
          </View>
        </Card>
      ) : (
        shoes.length === 0 && (
          <Pressable accessibilityRole="button" style={styles.addRow} onPress={() => setAdding(true)}>
            <Ionicons name="add-circle-outline" size={20} color={colors.accentText} />
            <Text style={styles.addRowText}>Add a shoe</Text>
          </Pressable>
        )
      )}
    </ScrollView>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    container: { padding: spacing.screenPadding, paddingTop: 24, paddingBottom: 40 },
    subtitle: { fontFamily: fonts.body, ...text("body"), color: colors.textDim, marginBottom: 14 },
    retiredCard: { opacity: 0.7 },
    shoeRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 12 },
    shoeIcon: { marginTop: 2 },
    shoeName: { fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: colors.textPrimary },
    shoeBrand: { fontFamily: fonts.body, ...text("small"), color: colors.textFaint, marginTop: 1 },
    retiredText: { color: colors.textDim },
    retireWrap: { alignSelf: "flex-start", marginTop: 10 },
    retireLink: { fontFamily: fonts.bodySemiBold, ...text("small"), color: colors.secondaryAccent },
    statusPill: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
    statusGood: { backgroundColor: colors.successText + "22" },
    statusWarn: { backgroundColor: colors.warningBg },
    statusText: { fontFamily: fonts.monoSemiBold, ...text("small") },
    statusTextGood: { color: colors.successText },
    statusTextWarn: { color: colors.warningText },
    progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.cardLine, overflow: "hidden" },
    progressFill: { height: "100%", backgroundColor: colors.accentMark, borderRadius: 4 },
    progressFillOver: { backgroundColor: colors.warning },
    mileageText: { fontFamily: fonts.mono, ...text("small"), color: colors.textDim, marginTop: 2 },
    mileageTextWarning: { color: colors.warningText },
    emptyText: { fontFamily: fonts.body, ...text("body"), color: colors.textFaint, marginBottom: 16 },
    fieldGap: { marginTop: 12 },
    addActions: { flexDirection: "row", gap: 10, marginTop: 16 },
    addRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
    addRowText: { fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.accentText },
  });
}
