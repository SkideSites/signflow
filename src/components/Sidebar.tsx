import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Columns3, Plus, LogOut, Settings } from "lucide-react";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import iconUrl from "/icon.png?url";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const nav: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/pipeline", label: "Pipeline", icon: Columns3 },
  { to: "/add-lead", label: "Add Lead", icon: Plus },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const navigate = useNavigate();

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 bg-sidebar border-r border-sidebar-border h-screen sticky top-0">
      <div className="px-3 pt-3 pb-2 flex items-center gap-2">
        <img src={iconUrl} alt="Signflow" width={28} height={28} className="rounded-md" />
        <span className="font-semibold tracking-tight">Signflow</span>
      </div>
      <div className="px-3 pt-2 pb-3">
        <WorkspaceSwitcher />
      </div>
      <nav className="flex-1 px-2 space-y-0.5">
        {nav.map((item) => {
          const active = isActive(item.to, item.exact);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-primary/15 text-primary border border-primary/25"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent border border-transparent"
              }`}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2.5 px-1 py-1.5">
          <div className="size-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-medium text-primary">
            {user?.email?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs truncate">{user?.email}</div>
          </div>
          <button
            onClick={signOut}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-sidebar-accent"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-sidebar border-t border-sidebar-border z-40 flex">
      {nav.map((item) => {
        const Icon = item.icon;
        const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] ${
              active ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Icon className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
