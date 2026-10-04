import { createClient } from "@supabase/supabase-js";

const env = __PUBLIC_ENV__;

export const APP_NAME = env.APP_NAME;
export const BUCKET = "estate-files";
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MIN_PASSWORD_LENGTH = 10;

export const isConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY);

// All app tables live in the `estate` schema (the Supabase project is shared with other apps).
export const supabase = createClient(
  env.SUPABASE_URL || "http://localhost:54321",
  env.SUPABASE_PUBLISHABLE_KEY || "missing-key",
  { db: { schema: "estate" } },
);
