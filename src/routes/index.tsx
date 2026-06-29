import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { AppShell } from "@/components/AppShell";
import { Dashboard } from "@/features/Dashboard";
import { Onboarding, shouldOnboard } from "@/features/Onboarding";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — Signflow" }] }),
  component: IndexPage,
});

function IndexPage() {
  const { user, loading } = useAuth();
  const { loading: wsLoading, current, workspaces } = useWorkspace();
  const [done, setDone] = useState(false);

  if (loading || wsLoading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/auth" />;

  const needsOnboarding = !done && (workspaces.length === 0 || shouldOnboard());
  if (needsOnboarding) return <Onboarding onDone={() => setDone(true)} />;

  if (!current) return <FullScreenLoader />;
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function FullScreenLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="size-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}
