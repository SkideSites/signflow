import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/AppShell";
import { Scripts } from "@/features/Scripts";

export const Route = createFileRoute("/scripts")({
  head: () => ({ meta: [{ title: "Scripts — Signflow" }] }),
  component: ScriptsPage,
});

function ScriptsPage() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return (
    <AppShell>
      <Scripts />
    </AppShell>
  );
}
