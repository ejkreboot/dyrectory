import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { AuthCard } from "../components/AuthCard";
import { Button, Field, FullPageSpinner, Input, Notice } from "../components/ui/controls";
import { useAuth } from "../auth/AuthProvider";
import { MIN_PASSWORD_LENGTH, supabase } from "../lib/supabase";
import { NoAccessPage } from "./NoAccessPage";

/** Reads an auth error from a reset link that has expired or been used already. */
function linkError(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
  return params.get("error_description");
}

/**
 * Used for three cases: first sign-in with a temporary password, arriving from a reset email,
 * and a voluntary password change.
 */
export function SetPasswordPage() {
  const { session, profile, loading, recovering, finishRecovery, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <FullPageSpinner />;

  if (!session) {
    const message = linkError();
    if (!message) return <Navigate to="/login" replace />;
    return (
      <AuthCard title="This link has expired" description="Password reset links can only be used once and expire after a short time.">
        <Link to="/forgot-password" className="block text-center text-sm font-medium text-accent hover:text-accent-strong">
          Send a new link
        </Link>
      </AuthCard>
    );
  }

  if (!profile?.is_active) return <NoAccessPage />;

  const firstTime = profile.must_change_password && !recovering;
  const required = profile.must_change_password || recovering;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Please use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      setError(
        /different from the old/i.test(updateError.message)
          ? "Please choose a password that's different from your temporary one."
          : updateError.message,
      );
      return;
    }
    await supabase.rpc("clear_must_change_password");
    await refreshProfile();
    finishRecovery();
    navigate("/files", { replace: true });
  }

  return (
    <AuthCard
      title={firstTime ? "Choose your password" : required ? "Set a new password" : "Change your password"}
      description={
        firstTime
          ? `Welcome, ${profile.display_name || profile.email}. You signed in with a temporary password — please choose your own to continue.`
          : `Signed in as ${profile.email}.`
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice tone="danger">{error}</Notice>}
        <input type="email" autoComplete="username" value={profile.email} readOnly hidden />
        <Field label="New password" htmlFor="password" hint={`At least ${MIN_PASSWORD_LENGTH} characters. A short phrase is easy to remember.`}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm">
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" busy={busy} className="w-full">
          Save password
        </Button>
        {required ? (
          <button type="button" onClick={signOut} className="block w-full text-center text-sm text-ink-muted hover:text-ink">
            Sign out
          </button>
        ) : (
          <Link to="/files" className="block text-center text-sm text-ink-muted hover:text-ink">
            Cancel
          </Link>
        )}
      </form>
    </AuthCard>
  );
}
