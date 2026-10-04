import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "./AuthProvider";
import { FullPageSpinner } from "../components/ui/controls";
import { NoAccessPage } from "../pages/NoAccessPage";

export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { session, profile, loading, recovering } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!profile?.is_active) return <NoAccessPage />;
  if (profile.must_change_password || recovering) return <Navigate to="/set-password" replace />;
  if (admin && profile.role !== "admin") return <Navigate to="/files" replace />;
  return children;
}
