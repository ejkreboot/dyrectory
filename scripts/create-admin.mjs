// Makes someone an estate administrator.
//
//   npm run create-admin -- you@example.com "Your Name"
//
// Reads SUPABASE_URL and SECRET_KEY from .env. If the email has no account on the Supabase
// project yet, one is created with a temporary password (printed below) that must be changed at
// first sign-in. If it already has an account (e.g. from another app on the same project), that
// account is made an estate admin and its password is left alone.
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [email, ...nameParts] = process.argv.slice(2);
const displayName = nameParts.join(" ").trim();

if (!email || !email.includes("@")) {
  console.error('Usage: npm run create-admin -- you@example.com "Your Name"');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SECRET_KEY;
if (!url || !secretKey) {
  console.error("SUPABASE_URL and SECRET_KEY must be set in .env");
  process.exit(1);
}

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "estate" },
});

function temporaryPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const chars = Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

async function findUser(address) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === address.toLowerCase());
    if (match || data.users.length < 200) return match ?? null;
  }
}

// Fail early (before creating anything) if the schema isn't reachable.
const { error: schemaError } = await supabase.from("profiles").select("id").limit(1);
if (schemaError) {
  console.error(`Couldn't read estate.profiles: ${schemaError.message}`);
  console.error("Has the migration been applied, and is the `estate` schema exposed in Settings → Data API?");
  process.exit(1);
}

const normalizedEmail = email.trim().toLowerCase();
let user = await findUser(normalizedEmail);
let password = null;

if (user) {
  console.log(`Found an existing account for ${normalizedEmail}; its password is unchanged.`);
} else {
  password = temporaryPassword();
  const { data, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) throw error;
  user = data.user;
}

const { data: existingProfile, error: readError } = await supabase
  .from("profiles")
  .select("display_name, must_change_password")
  .eq("id", user.id)
  .maybeSingle();
if (readError) throw readError;

const { error: profileError } = await supabase.from("profiles").upsert({
  id: user.id,
  email: normalizedEmail,
  display_name: displayName || existingProfile?.display_name || "",
  role: "admin",
  is_active: true,
  must_change_password: password ? true : (existingProfile?.must_change_password ?? false),
});
if (profileError) throw profileError;

console.log(`\n${normalizedEmail} is an administrator.`);
if (password) {
  console.log(`Temporary password: ${password}`);
  console.log("You'll be asked to choose your own password the first time you sign in.");
}
