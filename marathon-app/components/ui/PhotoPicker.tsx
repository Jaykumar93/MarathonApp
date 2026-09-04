import React, { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { fonts } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { MAX_ACTIVITY_PHOTOS, uploadActivityPhoto, deleteActivityPhoto } from "../../lib/data/activityPhotos";

interface PhotoPickerProps {
  userId: string;
  photos: string[];
  onChange: (photos: string[]) => void;
  /** "dark" for use on Active Run's permanently-dark screen; "light" (default) everywhere else. */
  variant?: "light" | "dark";
}

/**
 * Up to MAX_ACTIVITY_PHOTOS square slots in a row - filled ones show the
 * photo plus a remove button, one open "+" slot at the end lets you add
 * more (capped at the limit, so the "+" simply disappears once full).
 * Picking and removing both touch Storage directly (see
 * lib/data/activityPhotos.ts) so `photos` is always a list of real,
 * already-uploaded public URLs, never a pending local file.
 */
export function PhotoPicker({ userId, photos, onChange, variant = "light" }: PhotoPickerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dark = variant === "dark";

  async function handleAdd() {
    setError(null);
    const remaining = MAX_ACTIVITY_PHOTOS - photos.length;
    if (remaining <= 0) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo access denied - enable it in Settings to attach pictures.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: remaining > 1,
      selectionLimit: remaining,
      quality: 0.7,
    });
    if (result.canceled || result.assets.length === 0) return;

    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const asset of result.assets) {
        try {
          uploaded.push(await uploadActivityPhoto(userId, asset.uri));
        } catch {
          // One failed upload shouldn't lose the others already succeeded.
        }
      }
      if (uploaded.length < result.assets.length) {
        setError("Some photos couldn't be uploaded - try again.");
      }
      onChange([...photos, ...uploaded]);
    } finally {
      setUploading(false);
    }
  }

  function handleRemove(url: string) {
    onChange(photos.filter((p) => p !== url));
    deleteActivityPhoto(url);
  }

  return (
    <View>
      <View style={styles.row}>
        {photos.map((url) => (
          <View key={url} style={styles.slot}>
            <Image source={{ uri: url }} style={styles.slotImage} />
            <Pressable style={styles.removeBtn} onPress={() => handleRemove(url)} hitSlop={6} accessibilityLabel="Remove photo">
              <Ionicons name="close" size={13} color="#fff" />
            </Pressable>
          </View>
        ))}
        {photos.length < MAX_ACTIVITY_PHOTOS && (
          <Pressable
            style={[styles.slot, styles.addSlot, dark && styles.addSlotDark]}
            onPress={handleAdd}
            disabled={uploading}
            accessibilityLabel="Add a photo"
          >
            {uploading ? (
              <ActivityIndicator color={dark ? "#fff" : colors.textDim} />
            ) : (
              <Ionicons name="add" size={22} color={dark ? "#fff" : colors.textDim} />
            )}
          </Pressable>
        )}
      </View>
      {error && <Text style={[styles.errorText, dark && styles.errorTextDark]}>{error}</Text>}
    </View>
  );
}

const SLOT_SIZE = 72;

function createStyles(colors: Colors) {
  return StyleSheet.create({
    row: { flexDirection: "row", gap: 10 },
    slot: { width: SLOT_SIZE, height: SLOT_SIZE, borderRadius: 12, overflow: "hidden" },
    slotImage: { width: "100%", height: "100%" },
    removeBtn: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: "rgba(20,22,26,0.65)",
      alignItems: "center",
      justifyContent: "center",
    },
    addSlot: {
      borderWidth: 1.5,
      borderColor: colors.cardLine,
      borderStyle: "dashed",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.cardBg,
    },
    addSlotDark: { borderColor: "rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.06)" },
    errorText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.danger, marginTop: 6 },
    errorTextDark: { color: "#f0a89e" },
  });
}
