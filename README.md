# Estate Organizer

A small private web app for managing a family estate together:

- **Documents**: a password-protected shared folder, like Dropbox. Upload by button or drag and drop, create nested folders, rename, move, download, search.
- **To-do**: a shared task list with due dates, assignees, notes, and links to any uploaded documents.
- **Members** (admins only): add people with a temporary password, reset passwords, revoke or restore access, and promote other admins.

Stack: React + Vite + Tailwind on the front end; Supabase Auth, Postgres (row-level security), Storage, and one Edge Function on the back end.

## How access works

- Only people with an **active row in `estate.profiles`** can see anything. Admins create those rows from the Members page (through the `estate-admin` edge function, which holds the service key). Nobody can sign up on their own.
- Everyone who is a member has full access to documents and to-dos. Admins can also manage members.
- New members get a **temporary password** and must choose their own the first time they sign in. "Forgot password" sends a reset email.
- **Revoke access** takes effect on the person's very next request, because row-level security checks `is_active` on every query and storage request.
- Files live in a **private** bucket (`estate-files`). The browser only ever gets 60-second signed URLs.

### Shared Supabase project

This app runs inside a Supabase project that other apps also use. To keep things separate:

- All tables and functions are in their own **`estate` schema**. Storage policies are prefixed `estate:` and scoped to the `estate-files` bucket.
- **Auth users are shared** with the other apps, so the app never bans or deletes auth users. "Revoke" and "Remove" only change estate membership.
- If you add someone whose email already has an account on the project, they keep their existing password. (Resetting their password from the Members page changes it for every app on the project.)
- Project-wide auth settings (sign-up toggle, email templates, Site URL) are shared too. Open sign-up on another app doesn't grant access here, because membership is opt-in.
- Migrations are applied with `supabase db query`, **not** `supabase db push`. The project's migration history belongs to the other apps, and adding entries to it would break their `db push`.

## Running locally

```sh
npm install
npm run dev          # http://localhost:5180
```

`.env` (see `.env.example`) needs:

| Variable       | Used by                          |
| -------------- | -------------------------------- |
| `SUPABASE_URL` | browser + scripts                |
| `PUBLIC_KEY`   | browser (publishable key)        |
| `SECRET_KEY`   | `scripts/create-admin.mjs` only. It is never sent to the browser. |
| `APP_NAME`     | optional, shown in the header and tab |

`vite.config.ts` passes only the URL, publishable key, and app name through to the browser.

## First-time setup (already done for the Dev project)

1. Apply the schema:
   ```sh
   supabase db query --linked -f supabase/migrations/20261003000000_estate_schema.sql
   ```
2. Deploy the admin function:
   ```sh
   supabase functions deploy estate-admin --use-api --no-verify-jwt
   ```
   (The JWT check happens inside the function, which works with Supabase's new signing keys.)
3. In the dashboard:
   - **Project Settings → Data API → Exposed schemas**: add `estate`.
   - **Authentication → URL Configuration → Redirect URLs**: add `http://localhost:5180/set-password` and, once deployed, `https://<your-domain>/set-password`.
4. Make yourself an admin:
   ```sh
   npm run create-admin -- you@example.com "Your Name"
   ```
   A new account gets a temporary password, printed in the terminal. If the email already has an account on the project, it is promoted and its password is left alone.

## Deploying the front end

It's a static site. Build with `npm run build` and host `dist/` anywhere (Netlify, Vercel, Cloudflare Pages…). Set `SUPABASE_URL` and `PUBLIC_KEY` as build-time environment variables. Configure the host to serve `index.html` for all routes (SPA fallback). Then add `https://<your-domain>/set-password` to the Supabase redirect URLs.

## Limits and notes

- Maximum upload size is 50 MB per file (the bucket limit; the Supabase free plan's global cap is also 50 MB).
- Deleting a folder deletes everything inside it. Deleting a file removes it from any to-dos that referenced it, but the to-dos stay.
- Password-reset emails use Supabase's built-in mailer, which is rate-limited. Configure custom SMTP in the dashboard if you rely on them.

## Project layout

```
src/
  auth/            session + profile context, route guard
  components/      layout, dialogs, file and task components, UI primitives
  lib/             supabase client, file operations, admin API client, formatting
  pages/           Login, ForgotPassword, SetPassword, Files, Tasks, Members
supabase/
  migrations/      estate schema, RLS policies, storage bucket + policies
  functions/estate-admin/   admin-only member management (service role)
scripts/create-admin.mjs    bootstrap an administrator
```
