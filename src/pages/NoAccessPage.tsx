import { AuthCard } from "../components/AuthCard";
import { Button } from "../components/ui/controls";
import { useAuth } from "../auth/AuthProvider";

export function NoAccessPage() {
  const { session, signOut } = useAuth();
  return (
    <AuthCard
      title="Access not available"
      description={
        <>
          The account <span className="text-ink">{session?.user.email}</span> doesn't currently have access. If you think this
          is a mistake, please contact the administrator.
        </>
      }
    >
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => window.location.reload()}>
          Try again
        </Button>
        <Button className="flex-1" variant="primary" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </AuthCard>
  );
}
