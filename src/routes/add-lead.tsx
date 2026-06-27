import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { AppShell } from "@/components/AppShell";
import { AddLead } from "@/features/AddLead";

export const Route = createFileRoute("/add-lead")({
  head: () => ({ meta: [{ title: "Add Lead — Signflow" }] }),
  component: Page,
});

function Page() {
  const { user, loading } = useAuth();
  const { current, loading: wsLoading } = useWorkspace();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return <AppShell>{wsLoading || !current ? null : <AddLead />}</AppShell>;
}
