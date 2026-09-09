import { makeRedirectUri } from "expo-auth-session";
import * as Linking from "expo-linking";
import { supabase } from "../supabase";

/**
 * Sends the reset email. redirectTo must be on Supabase's own redirect
 * allow-list (Dashboard -> Authentication -> URL Configuration) or it falls
 * back to the project's default site_url instead of bringing the user back
 * into this app - `stryde://reset-password` (native) and the web app's own
 * origin + /reset-password both need adding there once, by hand; nothing
 * client-side can register them.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const redirectTo = makeRedirectUri({ path: "reset-password" });
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

/**
 * True if this deep link is the password-recovery redirect specifically
 * (carries `type=recovery`), not a normal OAuth sign-in - both exchange
 * their `code` param the same way (see createSessionFromUrl in
 * googleAuth.ts), but only a recovery redirect should land on
 * /reset-password instead of wherever AuthGate would otherwise send an
 * already-authenticated user.
 */
export function isPasswordRecoveryUrl(url: string): boolean {
  const { queryParams } = Linking.parse(url);
  return queryParams?.type === "recovery";
}
