import { Platform } from "react-native";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "../supabase";

// Lets the in-app browser session close itself and hand control back to the
// app once Supabase redirects to our scheme - required once per app, not
// per call.
WebBrowser.maybeCompleteAuthSession();

/**
 * Exchanges the PKCE `code` param on a Supabase OAuth redirect URL for a
 * real session. Called from two places: directly after a successful native
 * WebBrowser.openAuthSessionAsync() below, and from the root-level
 * Linking.useLinkingURL() listener in app/_layout.tsx, which is what
 * actually catches the redirect on web (see signInWithGoogle for why).
 * A URL with no `code` param (any other deep link) is silently ignored.
 */
export async function createSessionFromUrl(url: string): Promise<void> {
  const { queryParams } = Linking.parse(url);
  const code = typeof queryParams?.code === "string" ? queryParams.code : null;
  if (!code) return;

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  // AuthGate (app/_layout.tsx) picks up the resulting session change via
  // onAuthStateChange and routes automatically.
}

/**
 * Starts the Google OAuth flow. On native, opens the system browser and
 * exchanges the returned code directly. On web, does a plain full-tab
 * redirect instead of a popup - expo-web-browser's popup requires being
 * opened synchronously from the click, but signInWithOAuth's own network
 * call happens first, so by the time openAuthSessionAsync would run,
 * browsers no longer treat it as a trusted user gesture and block it. The
 * web redirect's return trip is caught by the root-level listener instead.
 */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = makeRedirectUri();

  if (Platform.OS === "web") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) throw error;
    return;
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error("Couldn't start Google sign-in.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return;
  await createSessionFromUrl(result.url);
}
