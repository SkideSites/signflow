import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { AppShell } from "@/components/AppShell";
import { Pipeline } from "@/features/Pipeline";

export const Route = createFileRoute("/pipeline")({
  head: () => ({ meta: [{ title: "Pipeline — Signflow" }] }),
  component: Page,
});

function Page() {
  const { user, loading } = useAuth();
  const { current, loading: wsLoading } = useWorkspace();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return <AppShell>{wsLoading || !current ? null : <Pipeline />}</AppShell>;
}
