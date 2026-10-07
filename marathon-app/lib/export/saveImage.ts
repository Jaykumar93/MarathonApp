import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File } from "expo-file-system";

const SAVE_DIR_KEY = "stryde.shareSaveDirectoryUri";

/**
 * "Download" for a captured image. No gallery/media-library permission
 * involved on purpose - that would add a READ_MEDIA_* permission to the
 * manifest (and a Play Console declaration with it) just to write one file.
 * Instead the runner picks a folder once through the system's own folder
 * picker (Storage Access Framework on Android), which grants access to
 * exactly that folder and nothing else. The chosen folder is remembered, so
 * every later download is one tap; if the remembered grant has lapsed (or
 * the folder was deleted) the write fails and the picker simply opens
 * again.
 *
 * Returns false if the runner dismissed the picker without choosing one.
 */
export async function saveImageToDevice(sourceUri: string, filename: string): Promise<boolean> {
  if (Platform.OS === "web") {
    // On web the capture comes back as a data URI - a plain anchor download is
    // the standard way to hand it to the browser.
    const link = document.createElement("a");
    link.href = sourceUri;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }

  const bytes = await new File(sourceUri).bytes();

  const remembered = await AsyncStorage.getItem(SAVE_DIR_KEY).catch(() => null);
  if (remembered) {
    try {
      new Directory(remembered).createFile(filename, "image/png").write(bytes);
      return true;
    } catch {
      // Grant lapsed or folder gone - fall through to asking again.
    }
  }

  let directory: Directory;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch {
    return false;
  }
  directory.createFile(filename, "image/png").write(bytes);
  await AsyncStorage.setItem(SAVE_DIR_KEY, directory.uri).catch(() => {});
  return true;
}
