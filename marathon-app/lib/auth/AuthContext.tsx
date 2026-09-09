import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { getActiveGoal } from "../data/goals";
import { registerForPushNotifications } from "../notifications/pushToken";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  username: string | null;
  status: "pending" | "approved" | "rejected";
  access_granted: boolean;
  is_admin: boolean;
  onboarding_completed_at: string | null;
  theme_preference: "light" | "dark";
  distance_unit: "km" | "mi";
  voice_coaching_enabled: boolean;
  voice_announcement_interval_km: number;
  daily_notification_enabled: boolean;
  notification_hour_local: number;
  /** Written by onboarding's health-data step; 'none' means no source was ever chosen. Column already existed in the DB (Task 2) - this type just catches the TS side up to it. */
  health_data_source: "health_connect" | "healthkit" | "manual" | "none" | null;
  created_at: string;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** null = not yet checked, true/false once known. */
  hasActiveGoal: boolean | null;
  refreshProfile: () => Promise<void>;
  refreshActiveGoal: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasActiveGoal, setHasActiveGoal] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    setProfile(!error && data ? (data as Profile) : null);
  }

  async function refreshProfile() {
    if (session?.user?.id) await fetchProfile(session.user.id);
  }

  async function refreshActiveGoal() {
    if (!session?.user?.id) {
      setHasActiveGoal(false);
      return;
    }
    const goal = await getActiveGoal(session.user.id);
    setHasActiveGoal(!!goal);
  }

  /**
   * Fetches the profile and checks for an active goal together rather than
   * sequentially. The goal check used to only run once the profile had
   * resolved AND turned out to be approved (see the reactive effect below,
   * which still exists for reacting to a LATER status change, e.g. a live
   * waitlist approval) - that gating never actually needed the profile's
   * result, it was just skipping a wasted call for a non-approved user.
   * That user can't have a goal anyway (AuthGate redirects them to
   * /waitlist before onboarding is ever reachable), so the "wasted" call
   * here is a cheap, empty, RLS-scoped query - a fair trade for cutting a
   * full sequential network round-trip off every single app load for the
   * common case (an approved user).
   */
  async function fetchProfileAndGoal(userId: string): Promise<void> {
    await Promise.all([fetchProfile(userId), getActiveGoal(userId).then((goal) => setHasActiveGoal(!!goal))]);
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user?.id) {
        await fetchProfileAndGoal(data.session.user.id);
      } else {
        setHasActiveGoal(false);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) {
        await fetchProfileAndGoal(newSession.user.id);
      } else {
        setProfile(null);
        setHasActiveGoal(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Re-checks whenever profile.status actually changes after the initial
  // load (e.g. a live waitlist approval while the app is open) - the
  // initial check itself now happens in fetchProfileAndGoal, in parallel
  // with the profile fetch, not gated behind it; this fires one redundant
  // (harmless, non-blocking) extra time right after mount as a result,
  // since `loading` flipping false is also one of this effect's own
  // dependencies. Resolves to false (not null) in every other case -
  // including "no session at all" - so the gate below isn't stuck waiting
  // on a check that will never run for a signed-out user.
  useEffect(() => {
    if (loading) return;
    if (session?.user?.id && profile?.status === "approved") {
      refreshActiveGoal();
    } else {
      setHasActiveGoal(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session?.user?.id, profile?.status]);

  // Fire-and-forget, same gating as the goal check above - no point
  // registering a push token for someone who's still on the waitlist.
  useEffect(() => {
    if (loading || !session?.user?.id || profile?.status !== "approved") return;
    registerForPushNotifications(session.user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session?.user?.id, profile?.status]);

  return (
    <AuthContext.Provider value={{ session, profile, loading, hasActiveGoal, refreshProfile, refreshActiveGoal }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
