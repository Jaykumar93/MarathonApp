import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth/AuthContext";
import { createShoe, getShoes, retireShoe, type ShoeRow } from "../lib/data/shoes";
import { formatDistance } from "../lib/units";
import { fonts, spacing, type } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "../components/ui/Card";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { TextField } from "../components/ui/TextField";

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
    <ScrollView style={styles.screen} contentContainerStyle={[styles.container, { paddingTop: 24 + insets.top }]}>
      <View style={styles.topRow}>
        <Pressable onPress={goBack} hitSlop={10}>
          <Text style={styles.backLink}>‹ Back</Text>
        </Pressable>
      </View>
      <Text style={styles.header}>Gear</Text>
      <Text style={styles.subtitle}>Track shoe mileage - a nudge shows once a shoe passes its retirement distance.</Text>

      {!loading &&
        shoes.map((shoe) => {
          const overThreshold = shoe.cumulative_distance_km >= shoe.retirement_threshold_km;
          const progress = Math.min(1, shoe.cumulative_distance_km / shoe.retirement_threshold_km);
          return (
            <Card key={shoe.id} style={shoe.retired ? styles.retiredCard : undefined}>
              <View style={styles.shoeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.shoeName, shoe.retired && styles.retiredText]}>{shoe.name}</Text>
                  {!!shoe.brand && <Text style={[styles.shoeBrand, shoe.retired && styles.retiredText]}>{shoe.brand}</Text>}
                </View>
                <Pressable onPress={() => handleToggleRetire(shoe)} hitSlop={8}>
                  <Text style={styles.retireLink}>{shoe.retired ? "Un-retire" : "Retire"}</Text>
                </Pressable>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${progress * 100}%` }, overThreshold && styles.progressFillOver]}
                />
              </View>
              <Text style={[styles.mileageText, overThreshold && !shoe.retired && styles.mileageTextWarning]}>
                {formatDistance(shoe.cumulative_distance_km, unit)} of {formatDistance(shoe.retirement_threshold_km, unit)}
                {overThreshold && !shoe.retired ? " · past due for retirement" : ""}
              </Text>
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
        <Pressable style={styles.addRow} onPress={() => setAdding(true)}>
          <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
          <Text style={styles.addRowText}>Add a shoe</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    container: { padding: spacing.screenPadding, paddingTop: 24, paddingBottom: 40 },
    topRow: { marginBottom: 10 },
    backLink: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textDim },
    header: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary, marginBottom: 6 },
    subtitle: { fontFamily: fonts.body, fontSize: type.pDim, color: colors.textDim, marginBottom: 18 },
    retiredCard: { opacity: 0.55 },
    shoeRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
    shoeName: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textPrimary },
    shoeBrand: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginTop: 2 },
    retiredText: { color: colors.textFaint },
    retireLink: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.secondaryAccent },
    progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.cardLine, overflow: "hidden" },
    progressFill: { height: "100%", backgroundColor: colors.contour, borderRadius: 3 },
    progressFillOver: { backgroundColor: colors.warning },
    mileageText: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginTop: 6 },
    mileageTextWarning: { color: colors.warningText, fontFamily: fonts.bodyMedium },
    emptyText: { fontFamily: fonts.body, fontSize: type.pDim, color: colors.textFaint, marginBottom: 16 },
    fieldGap: { marginTop: 12 },
    addActions: { flexDirection: "row", gap: 10, marginTop: 16 },
    addRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
    addRowText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.accent },
  });
}
