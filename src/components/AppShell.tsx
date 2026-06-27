import { Sidebar, MobileNav } from "./Sidebar";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import iconUrl from "/icon.png?url";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden flex items-center gap-2 px-4 h-14 border-b border-border bg-sidebar">
          <img src={iconUrl} alt="Signflow" width={24} height={24} className="rounded" />
          <span className="font-semibold">Signflow</span>
          <div className="ml-auto w-44"><WorkspaceSwitcher /></div>
        </header>
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
        <MobileNav />
      </div>
    </div>
  );
}
