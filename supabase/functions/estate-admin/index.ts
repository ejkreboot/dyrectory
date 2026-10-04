// Admin-only membership management for the estate app: list, add, reset password, change role,
// revoke/restore access, remove. The caller's JWT is verified here and must belong to an active
// estate admin.
//
// The Supabase project's auth users are shared with other apps, so this function only manages
// rows in estate.profiles. It never bans or deletes auth users; the only auth-level changes are
// creating a brand-new account and an explicit password reset.
import { createClient } from "npm:@supabase/supabase-js@2";

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "estate" },
  });
}

type SupabaseClient = ReturnType<typeof serviceClient>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MIN_PASSWORD_LENGTH = 10;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceKey(): string {
  // Projects on the new API keys expose them as JSON; fall back to the legacy service role key.
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as Record<string, string>;
      const key = parsed.default ?? Object.values(parsed)[0];
      if (key) return key;
    } catch {
      // ignore and fall back
    }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new HttpError(500, "Service key is not configured.");
  return legacy;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `Missing ${field}.`);
  }
  return value.trim();
}

function requirePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return value;
}

function requireRole(value: unknown): "admin" | "member" {
  if (value !== "admin" && value !== "member") throw new HttpError(400, "Invalid role.");
  return value;
}

async function requireAdmin(sb: SupabaseClient, req: Request): Promise<string> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Not signed in.");

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Please sign in again.");

  const { data: profile } = await sb
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile?.is_active || profile.role !== "admin") {
    throw new HttpError(403, "Only an administrator can manage members.");
  }
  return data.user.id;
}

async function requireMember(sb: SupabaseClient, userId: string) {
  const { data, error } = await sb.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "That person isn't a member.");
}

async function updateProfile(sb: SupabaseClient, userId: string, changes: Record<string, unknown>) {
  const { error } = await sb.from("profiles").update(changes).eq("id", userId);
  if (error) throw new HttpError(500, error.message);
}

async function findAuthUserByEmail(sb: SupabaseClient, email: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new HttpError(500, error.message);
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match || data.users.length < 200) return match ?? null;
  }
}

async function listMembers(sb: SupabaseClient) {
  const { data: profiles, error } = await sb
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new HttpError(500, error.message);

  return await Promise.all(
    profiles.map(async (p) => {
      const { data } = await sb.auth.admin.getUserById(p.id);
      return { ...p, last_sign_in_at: data.user?.last_sign_in_at ?? null };
    }),
  );
}

// deno-lint-ignore no-explicit-any
async function handle(sb: SupabaseClient, callerId: string, body: any) {
  switch (body?.action) {
    case "list":
      return { members: await listMembers(sb) };

    case "create": {
      const email = requireString(body.email, "email").toLowerCase();
      const displayName = requireString(body.display_name, "name");
      const password = requirePassword(body.password);
      const role = requireRole(body.role ?? "member");

      const created = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });

      if (created.error) {
        if (created.error.code !== "email_exists") throw new HttpError(400, created.error.message);
        // They already have an account on this Supabase project (from another app). Grant
        // membership without touching their password, which those apps share.
        const existing = await findAuthUserByEmail(sb, email);
        if (!existing) throw new HttpError(400, created.error.message);
        const { data: already } = await sb.from("profiles").select("id").eq("id", existing.id).maybeSingle();
        if (already) throw new HttpError(409, "That person is already a member.");
        const { error } = await sb.from("profiles").insert({
          id: existing.id,
          email,
          display_name: displayName,
          role,
          must_change_password: false,
        });
        if (error) throw new HttpError(500, error.message);
        return { ok: true, existing_account: true };
      }

      const { error } = await sb.from("profiles").insert({
        id: created.data.user.id,
        email,
        display_name: displayName,
        role,
        must_change_password: true,
      });
      if (error) {
        await sb.auth.admin.deleteUser(created.data.user.id);
        throw new HttpError(500, error.message);
      }
      return { ok: true, existing_account: false };
    }

    case "reset_password": {
      const userId = requireString(body.user_id, "user");
      const password = requirePassword(body.password);
      await requireMember(sb, userId);
      const { error } = await sb.auth.admin.updateUserById(userId, { password });
      if (error) throw new HttpError(400, error.message);
      await updateProfile(sb, userId, { must_change_password: true });
      return { ok: true };
    }

    case "set_role": {
      const userId = requireString(body.user_id, "user");
      const role = requireRole(body.role);
      if (userId === callerId && role !== "admin") {
        throw new HttpError(400, "You can't remove your own administrator role.");
      }
      await updateProfile(sb, userId, { role });
      return { ok: true };
    }

    case "set_active": {
      const userId = requireString(body.user_id, "user");
      const active = body.active === true;
      if (userId === callerId && !active) {
        throw new HttpError(400, "You can't revoke your own access.");
      }
      // Row-level security keys off is_active, so this takes effect on the very next request.
      await updateProfile(sb, userId, { is_active: active });
      return { ok: true };
    }

    case "update_name": {
      const userId = requireString(body.user_id, "user");
      const displayName = requireString(body.display_name, "name");
      await updateProfile(sb, userId, { display_name: displayName });
      return { ok: true };
    }

    case "remove": {
      const userId = requireString(body.user_id, "user");
      if (userId === callerId) throw new HttpError(400, "You can't remove yourself.");
      const { error } = await sb.from("profiles").delete().eq("id", userId);
      if (error) throw new HttpError(500, error.message);
      return { ok: true };
    }

    default:
      throw new HttpError(400, "Unknown action.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const sb = serviceClient();
    const callerId = await requireAdmin(sb, req);
    const body = await req.json().catch(() => null);
    return json(await handle(sb, callerId, body));
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: "Something went wrong." }, 500);
  }
});
