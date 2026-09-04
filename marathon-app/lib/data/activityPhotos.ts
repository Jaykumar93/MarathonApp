import { supabase } from "../supabase";

export const MAX_ACTIVITY_PHOTOS = 3;

/**
 * Uploads one already-picked local image (a `file://` URI from
 * expo-image-picker) to the public `activity-photos` Storage bucket, under
 * a path scoped to the uploading user (`{userId}/{filename}`) - matches
 * the bucket's RLS policies (see migration 20260904120000), which only
 * allow writing under your own user id folder. Returns the public URL,
 * which is what gets stored directly on the activity row - the bucket is
 * public-read, so no signed-URL refresh logic is needed anywhere that
 * later displays it.
 *
 * `fetch(uri).blob()` is the standard way to turn a local file:// URI into
 * upload-ready bytes in React Native/Expo - no extra file-system
 * dependency needed just for this one conversion.
 */
export async function uploadActivityPhoto(userId: string, localUri: string): Promise<string> {
  const extMatch = /\.(\w+)$/.exec(localUri.split("?")[0]);
  const ext = (extMatch ? extMatch[1] : "jpg").toLowerCase();
  const path = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;

  const response = await fetch(localUri);
  const blob = await response.blob();

  const { error } = await supabase.storage.from("activity-photos").upload(path, blob, {
    contentType: ext === "png" ? "image/png" : "image/jpeg",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("activity-photos").getPublicUrl(path);
  return data.publicUrl;
}

/** Best-effort - a photo the user removes from an in-progress form (before the activity is even saved) shouldn't linger in Storage forever. Failure here is never fatal to the surrounding save/remove flow. */
export async function deleteActivityPhoto(publicUrl: string): Promise<void> {
  const marker = "/activity-photos/";
  const index = publicUrl.indexOf(marker);
  if (index === -1) return;
  const path = publicUrl.slice(index + marker.length);
  await supabase.storage
    .from("activity-photos")
    .remove([path])
    .catch(() => {});
}
