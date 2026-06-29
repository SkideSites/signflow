import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LANGUAGES, getLang, setLang, type LangCode } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Signflow" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, loading } = useAuth();
  const { current, loading: wsLoading } = useWorkspace();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return <AppShell>{wsLoading || !current ? null : <SettingsBody />}</AppShell>;
}

function SettingsBody() {
  const { user } = useAuth();
  const { current, refresh } = useWorkspace();
  const qc = useQueryClient();
  const [lang, setLangState] = useState<LangCode>(getLang());
  const [contacts, setContacts] = useState(current?.daily_target_contacts ?? 25);
  const [followups, setFollowups] = useState(current?.daily_target_followups ?? 10);

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
  });
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");

  const saveGoals = async () => {
    if (!current) return;
    await supabase.from("workspaces").update({
      daily_target_contacts: Math.max(1, Number(contacts) || 25),
      daily_target_followups: Math.max(1, Number(followups) || 10),
    }).eq("id", current.id);
    await refresh();
    toast.success("Goals updated");
  };

  const saveProfile = async () => {
    if (!user) return;
    await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id);
    qc.invalidateQueries({ queryKey: ["my-profile", user.id] });
    toast.success("Profile updated");
  };

  const changeLang = (v: string) => {
    setLangState(v as LangCode);
    setLang(v as LangCode);
    toast.success("Language updated");
  };

  const deleteWorkspace = async () => {
    if (!current || current.type === "personal") return;
    if (!confirm(`Delete workspace "${current.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("workspaces").delete().eq("id", current.id);
    if (error) toast.error(error.message);
    else {
      await refresh();
      toast.success("Workspace deleted");
    }
  };

  return (
    <div className="px-4 md:px-8 py-8 max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card title="Language">
        <Select value={lang} onValueChange={changeLang}>
          <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card title="Daily Goals" desc="Targets that drive your Execution Score.">
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <div>
            <Label className="text-xs">Daily Contacts</Label>
            <Input type="number" min={1} value={contacts}
              onChange={(e) => setContacts(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Daily Follow-ups</Label>
            <Input type="number" min={1} value={followups}
              onChange={(e) => setFollowups(Number(e.target.value))} />
          </div>
        </div>
        <Button onClick={saveGoals} size="sm">Save goals</Button>
      </Card>

      <Card title="Profile">
        <div className="space-y-2 max-w-sm">
          <Label className="text-xs">Email</Label>
          <Input value={user?.email ?? ""} disabled />
          <Label className="text-xs mt-2">Display name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
        </div>
        <Button onClick={saveProfile} size="sm">Save profile</Button>
      </Card>

      <Card title="Workspace">
        <div className="text-sm">
          <div><span className="text-muted-foreground">Name:</span> {current?.name}</div>
          <div><span className="text-muted-foreground">Type:</span> {current?.type}</div>
        </div>
      </Card>

      <Card title="Danger zone" tone="danger">
        {current?.type === "personal" ? (
          <p className="text-xs text-muted-foreground">Personal workspaces cannot be deleted.</p>
        ) : (
          <Button variant="destructive" size="sm" onClick={deleteWorkspace}>
            Delete this workspace
          </Button>
        )}
      </Card>
    </div>
  );
}

function Card({ title, desc, tone, children }: { title: string; desc?: string; tone?: "danger"; children: React.ReactNode }) {
  return (
    <section className={`elevated-card p-5 space-y-3 ${tone === "danger" ? "border-destructive/30" : ""}`}>
      <div>
        <div className="text-sm font-medium">{title}</div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      {children}
    </section>
  );
}
