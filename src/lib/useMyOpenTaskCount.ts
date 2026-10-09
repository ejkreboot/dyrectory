import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "./supabase";

const TASKS_CHANGED = "estate:tasks-changed";

/** Call after creating, editing, completing or deleting a task so counts elsewhere stay current. */
export function notifyTasksChanged() {
  window.dispatchEvent(new Event(TASKS_CHANGED));
}

/** How many unfinished tasks are assigned to the signed-in user, or null until loaded. */
export function useMyOpenTaskCount(): number | null {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) {
      setCount(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", userId)
        .eq("is_done", false)
        .then(({ count, error }) => {
          if (cancelled) return;
          if (error) console.error("Could not count open tasks", error);
          else setCount(count ?? 0);
        });
    };
    load();
    // Others may assign tasks to you too; pick those up when you come back to the tab.
    window.addEventListener(TASKS_CHANGED, load);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener(TASKS_CHANGED, load);
      window.removeEventListener("focus", load);
    };
  }, [userId]);

  return count;
}
