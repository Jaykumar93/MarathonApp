import { supabase } from "../supabase";

export interface AdminProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  username: string | null;
  status: "pending" | "approved" | "rejected";
  access_granted: boolean;
  created_at: string;
}

/**
 * Every profile row, newest signup first - only returns more than the
 * caller's own row when they're an admin (see the "profiles: admin select
 * all" RLS policy); a non-admin calling this just gets their own single
 * row back, same as any other profiles query would.
 */
export async function getAllProfiles(): Promise<AdminProfileRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, username, status, access_granted, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as AdminProfileRow[];
}

/**
 * Approves or revokes a user's access. Re-verifies the admin's own
 * password (a fresh signInWithPassword call, independent of however long
 * their session has already been alive) immediately before the actual
 * mutation - the Edge Function itself re-checks is_admin() server-side
 * too, so this password step is a deliberate extra confirmation gate on
 * top of that, not the only thing standing between a bad actor and the
 * write.
 */
export async function setUserApproval(
  targetUserId: string,
  action: "approve" | "revoke",
  adminEmail: string,
  password: string
): Promise<void> {
  const { error: reAuthError } = await supabase.auth.signInWithPassword({ email: adminEmail, password });
  if (reAuthError) throw new Error("Incorrect password.");

  const { data, error } = await supabase.functions.invoke("admin-set-approval", {
    body: { targetUserId, action },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}
