import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { AuthCard } from "../components/AuthCard";
import { Button, Field, Input, Notice } from "../components/ui/controls";
import { supabase } from "../lib/supabase";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/set-password`,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email address and we'll send you a link to choose a new password."
    >
      {sent ? (
        <div className="space-y-4">
          <Notice tone="ok">If an account exists for {email.trim()}, a reset link is on its way. It may take a minute or two to arrive.</Notice>
          <Link to="/login" className="block text-center text-sm text-ink-muted hover:text-ink">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Notice tone="danger">{error}</Notice>}
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" busy={busy} className="w-full">
            Send reset link
          </Button>
          <Link to="/login" className="block text-center text-sm text-ink-muted hover:text-ink">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthCard>
  );
}
