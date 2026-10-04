import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { AuthCard } from "../components/AuthCard";
import { Button, Field, Input, Notice } from "../components/ui/controls";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";

function friendlyError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match our records.";
  if (/banned/i.test(message)) return "Your access has been turned off. Please contact the administrator.";
  if (/email not confirmed/i.test(message)) return "This account hasn't been confirmed yet. Please contact the administrator.";
  return message;
}

export function LoginPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
  const destination = from ? `${from.pathname}${from.search ?? ""}` : "/files";

  if (!loading && session) return <Navigate to={destination} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(friendlyError(error.message));
    else navigate(destination, { replace: true });
  }

  return (
    <AuthCard title="Sign in" description="Use the email address and password you were given.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" busy={busy} className="w-full">
          Sign in
        </Button>
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="text-ink-muted underline-offset-4 hover:text-ink hover:underline">
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
