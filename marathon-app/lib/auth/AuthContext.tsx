import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { getActiveGoal } from "../data/goals";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  status: "pending" | "approved" | "rejected";
  access_granted: boolean;
  onboarding_completed_at: string | null;
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

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user?.id) {
        await fetchProfile(data.session.user.id);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) {
        await fetchProfile(newSession.user.id);
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

  // Check for an active goal once the profile is known to be approved.
  // Resolves to false (not null) in every other case - including "no
  // session at all" - so the gate below isn't stuck waiting on a check
  // that will never run for a signed-out user.
  useEffect(() => {
    if (loading) return;
    if (session?.user?.id && profile?.status === "approved") {
      refreshActiveGoal();
    } else {
      setHasActiveGoal(false);
    }
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
