import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Member, Role } from "./types";

type AdminRequest =
  | { action: "list" }
  | { action: "create"; email: string; display_name: string; password: string; role: Role }
  | { action: "reset_password"; user_id: string; password: string }
  | { action: "set_role"; user_id: string; role: Role }
  | { action: "set_active"; user_id: string; active: boolean }
  | { action: "update_name"; user_id: string; display_name: string }
  | { action: "remove"; user_id: string };

/** Calls the estate-admin edge function (service-role operations, admin callers only). */
async function call<T>(body: AdminRequest): Promise<T> {
  const { data, error } = await supabase.functions.invoke("estate-admin", { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      if (payload?.error) throw new Error(payload.error);
    }
    if (error instanceof FunctionsFetchError) {
      throw new Error("Couldn't reach the admin service. Make sure the estate-admin function is deployed.");
    }
    throw error;
  }
  return data as T;
}

export const admin = {
  list: async () => (await call<{ members: Member[] }>({ action: "list" })).members,
  /** `existing_account`: they already had a sign-in on this Supabase project; password unchanged. */
  create: (input: { email: string; display_name: string; password: string; role: Role }) =>
    call<{ existing_account: boolean }>({ action: "create", ...input }),
  resetPassword: (userId: string, password: string) => call({ action: "reset_password", user_id: userId, password }),
  setRole: (userId: string, role: Role) => call({ action: "set_role", user_id: userId, role }),
  setActive: (userId: string, active: boolean) => call({ action: "set_active", user_id: userId, active }),
  updateName: (userId: string, displayName: string) => call({ action: "update_name", user_id: userId, display_name: displayName }),
  remove: (userId: string) => call({ action: "remove", user_id: userId }),
};
