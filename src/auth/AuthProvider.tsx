import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** True after arriving from a "reset your password" email link. */
  recovering: boolean;
  finishRecovery: () => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) console.error("Could not load profile", error);
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") setRecovering(false);
      setSession(next);
      setSessionReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileFor(null);
      return;
    }
    let cancelled = false;
    fetchProfile(userId).then((p) => {
      if (cancelled) return;
      setProfile(p);
      setProfileFor(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refreshProfile = useCallback(async () => {
    if (userId) setProfile(await fetchProfile(userId));
  }, [userId]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const finishRecovery = useCallback(() => setRecovering(false), []);

  const loading = !sessionReady || (userId !== null && profileFor !== userId);

  const value = useMemo<AuthState>(
    () => ({ session, profile, loading, recovering, finishRecovery, refreshProfile, signOut }),
    [session, profile, loading, recovering, finishRecovery, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
