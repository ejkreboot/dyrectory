import { NavLink, Outlet, useNavigate } from "react-router";
import { FolderClosed, KeyRound, ListChecks, LogOut, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import { APP_NAME } from "../lib/supabase";
import { personName } from "../lib/format";
import { useMyOpenTaskCount } from "../lib/useMyOpenTaskCount";
import { cx, IconButton } from "./ui/controls";
import { Logo } from "./Logo";

function NavItem({ to, icon, badge, children }: { to: string; icon: ReactNode; badge?: ReactNode; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors [&>svg]:size-4",
          isActive ? "bg-surface font-medium text-ink shadow-xs ring-1 ring-line" : "text-ink-muted hover:bg-surface/60 hover:text-ink",
        )
      }
    >
      {icon}
      {children}
      {badge}
    </NavLink>
  );
}

export function Layout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const isAdmin = profile?.role === "admin";
  const myOpenTasks = useMyOpenTaskCount();

  const nav = (
    <>
      <NavItem to="/files" icon={<FolderClosed />}>
        Documents
      </NavItem>
      <NavItem
        to="/tasks"
        icon={<ListChecks />}
        badge={
          myOpenTasks ? (
            <span
              className="ml-auto min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] leading-5 font-semibold text-white tabular-nums"
              aria-label={`${myOpenTasks} open ${myOpenTasks === 1 ? "task" : "tasks"} assigned to you`}
            >
              {myOpenTasks > 99 ? "99+" : myOpenTasks}
            </span>
          ) : null
        }
      >
        To-do
      </NavItem>
      {isAdmin && (
        <NavItem to="/members" icon={<Users />}>
          Members
        </NavItem>
      )}
    </>
  );

  return (
    <div className="min-h-dvh bg-paper md:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-sunken/50 md:flex md:h-dvh md:sticky md:top-0">
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-7">
          <Logo size={26} />
          <span className="truncate font-serif text-[17px] leading-tight text-ink">{APP_NAME}</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">{nav}</nav>
        <div className="border-t border-line px-3 py-3">
          <div className="px-3 pb-2">
            <p className="truncate text-sm font-medium text-ink">{personName(profile)}</p>
            <p className="truncate text-xs text-ink-muted">{profile?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/set-password")}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-ink-muted hover:bg-surface/60 hover:text-ink"
          >
            <KeyRound className="size-4" /> Change password
          </button>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-ink-muted hover:bg-surface/60 hover:text-ink"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <header className="border-b border-line bg-sunken/50 md:hidden">
        <div className="flex items-center gap-2.5 px-4 pt-3">
          <Logo size={22} />
          <span className="flex-1 truncate font-serif text-base text-ink">{APP_NAME}</span>
          <IconButton label="Change password" onClick={() => navigate("/set-password")}>
            <KeyRound className="size-4" />
          </IconButton>
          <IconButton label="Sign out" onClick={signOut}>
            <LogOut className="size-4" />
          </IconButton>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-2">{nav}</nav>
      </header>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
