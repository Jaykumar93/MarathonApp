// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/**
 * Approves or revokes a waitlisted user's access. The caller's own
 * password re-verification (supabase.auth.signInWithPassword) already
 * happened client-side immediately before this call - this function
 * trusts that gate the same way it trusts the caller's JWT itself (both
 * are things only the real account holder can produce), and independently
 * re-checks is_admin() server-side rather than trusting the client's own
 * admin-gated UI, since a client-side check alone is trivially bypassable
 * by anyone who can read the app's source.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await caller.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Not authenticated" }, 401);

    const { data: callerProfile, error: profileError } = await caller
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (profileError || !callerProfile?.is_admin) return jsonResponse({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null);
    const targetUserId = body?.targetUserId;
    const action = body?.action;

    if (typeof targetUserId !== "string" || !UUID_RE.test(targetUserId)) {
      return jsonResponse({ error: "Invalid targetUserId" }, 400);
    }
    if (action !== "approve" && action !== "revoke") {
      return jsonResponse({ error: "Invalid action - must be 'approve' or 'revoke'" }, 400);
    }

    // Only the service role can write status/access_granted at all
    // (protect_waitlist_status trigger blocks every other caller,
    // including this same admin acting through their own normal client).
    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error: updateError } = await serviceClient
      .from("profiles")
      .update(
        action === "approve"
          ? { status: "approved", access_granted: true }
          : { status: "pending", access_granted: false }
      )
      .eq("id", targetUserId);
    if (updateError) throw updateError;

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error("admin-set-approval error:", e);
    const message =
      e instanceof Error
        ? e.message
        : e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
