import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import type { Profile } from "./types";

/** Everyone with a profile, for showing names on files and tasks. */
export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("profiles")
      .select("*")
      .order("display_name")
      .then(({ data }) => {
        if (!cancelled && data) setProfiles(data as Profile[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const active = useMemo(() => profiles.filter((p) => p.is_active), [profiles]);
  return { profiles, active, byId };
}
