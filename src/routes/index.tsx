import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { AppShell } from "@/components/AppShell";
import { Dashboard } from "@/features/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — Signflow" }] }),
  component: IndexPage,
});

function IndexPage() {
  const { user, loading } = useAuth();
  const { loading: wsLoading, current } = useWorkspace();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/auth" />;
  return (
    <AppShell>
      {wsLoading || !current ? <FullScreenLoader /> : <Dashboard />}
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
