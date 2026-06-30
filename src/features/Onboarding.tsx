import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LANGUAGES, getLang, setLang, type LangCode } from "@/lib/i18n";
import { joinWorkspaceByCode } from "@/lib/workspace.functions";
import { toast } from "sonner";
import iconUrl from "/icon.png?url";

const ONBOARD_KEY = "signflow:onboarded";

export function shouldOnboard(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ONBOARD_KEY) !== "1";
}
function markOnboarded() {
  if (typeof window !== "undefined") localStorage.setItem(ONBOARD_KEY, "1");
}

type Step =
  | "language"
  | "identity"
  | "mode"
  | "join"
  | "workspace"
  | "positioning"
  | "lead"
  | "ready";

const IDENTITIES = [
  { id: "manage", label: "I manage leads daily" },
  { id: "team", label: "I run a sales team" },
  { id: "freelance", label: "I work as a freelancer / closer" },
  { id: "testing", label: "I'm testing Signflow" },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const { workspaces, current, setCurrentId, refresh } = useWorkspace();
  const [step, setStep] = useState<Step>("language");
  const [lang, setLangState] = useState<LangCode>(getLang());
  const [identity, setIdentity] = useState<string | null>(null);
  const [wsName, setWsName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [followers, setFollowers] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const joinFn = useServerFn(joinWorkspaceByCode);

  useEffect(() => {
    if (current?.name && !wsName) setWsName(current.name);
  }, [current?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseLang = (c: LangCode) => {
    setLangState(c);
    setLang(c);
    setStep("identity");
  };

  const finishWithLead = async () => {
    if (!user || !current || !handle.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("leads").insert({
        workspace_id: current.id,
        handle: handle.trim().replace(/^@/, ""),
        platform: platform as never,
        followers: followers ? Number(followers) : 0,
        notes: notes.trim() || null,
        stage: "TO_CONTACT",
        created_by: user.id,
      });
      if (error) throw error;
      setStep("ready");
      setTimeout(() => {
        markOnboarded();
        onDone();
      }, 2000);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveWorkspace = async () => {
    if (!user || !wsName.trim()) return;
    setBusy(true);
    try {
      let wsId = current?.id;
      if (!wsId || (current && current.type === "personal" && wsName.trim() !== current.name && identity === "team")) {
        // For team operators: create a team workspace
        const isTeam = identity === "team";
        if (isTeam) {
          const { data, error } = await supabase
            .from("workspaces")
            .insert({ name: wsName.trim(), type: "team", owner_id: user.id })
            .select()
            .single();
          if (error) throw error;
          await supabase.from("workspace_members")
            .insert({ workspace_id: data.id, user_id: user.id, role: "owner" });
          wsId = data.id;
        } else if (current) {
          await supabase.from("workspaces").update({ name: wsName.trim() }).eq("id", current.id);
        }
      } else if (current && current.name !== wsName.trim()) {
        await supabase.from("workspaces").update({ name: wsName.trim() }).eq("id", current.id);
      }
      await refresh();
      if (wsId) setCurrentId(wsId);
      setStep("positioning");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const joinByCode = async () => {
    if (!inviteCode.trim()) return;
    setBusy(true);
    try {
      const res = await joinFn({ data: { code: inviteCode.trim() } });
      if (!res.ok) {
        toast.error("Invite code not found.");
        return;
      }
      await refresh();
      setCurrentId(res.workspaceId);
      toast.success(`Joined ${res.name}`);
      setStep("positioning");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md elevated-card p-8 space-y-6">
        <div className="flex flex-col items-center text-center">
          <img src={iconUrl} alt="" width={44} height={44} className="rounded-xl mb-3" />
          <Steps current={step} />
        </div>

        {step === "language" && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-center">Choose your language</h2>
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map((l) => (
                <button key={l.code} onClick={() => chooseLang(l.code)}
                  className={`p-3 rounded-lg border text-sm transition ${
                    lang === l.code ? "border-primary bg-primary/10" : "border-border hover:bg-surface-hover"
                  }`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "identity" && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-center">What best describes you?</h2>
            <div className="space-y-2">
              {IDENTITIES.map((i) => (
                <button key={i.id}
                  onClick={() => { setIdentity(i.id); setStep("mode"); }}
                  className="w-full text-left p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition text-sm">
                  {i.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "mode" && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-center">Workspace</h2>
            <button onClick={() => setStep("workspace")}
              className="w-full text-left p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition text-sm font-medium">
              Create my workspace
            </button>
            <button onClick={() => setStep("join")}
              className="w-full text-left p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition text-sm font-medium">
              Join a team
            </button>
          </div>
        )}

        {step === "join" && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-center">Enter invite code</h2>
            <Input placeholder="ABC123" value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              className="text-center tracking-[0.3em] uppercase font-mono"
              maxLength={8} autoFocus />
            <Button className="w-full" onClick={joinByCode}
              disabled={!inviteCode.trim() || busy}>
              {busy ? "Joining…" : "Join"}
            </Button>
            <button onClick={() => setStep("mode")} className="text-xs text-muted-foreground w-full text-center hover:text-foreground">
              ← Back
            </button>
          </div>
        )}

        {step === "workspace" && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-center">Name your workspace</h2>
            <Input placeholder="My workspace" value={wsName}
              onChange={(e) => setWsName(e.target.value)} autoFocus />
            <Button className="w-full" onClick={saveWorkspace}
              disabled={!wsName.trim() || busy}>
              Continue
            </Button>
          </div>
        )}

        {step === "positioning" && (
          <div className="space-y-5 text-center py-2">
            <h2 className="text-xl font-semibold leading-snug">
              Signflow will tell you exactly what to do<br />each day to close more deals.
            </h2>
            <p className="text-sm text-muted-foreground">
              No planning. No dashboards. Just execution.
            </p>
            <Button className="w-full" size="lg" onClick={() => setStep("lead")}>
              Let's start
            </Button>
          </div>
        )}

        {step === "lead" && (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-center">Add your first lead</h2>
            <p className="text-xs text-muted-foreground text-center">
              We'll generate your first action immediately.
            </p>
            <div className="space-y-2">
              <Label className="text-xs">Handle</Label>
              <Input placeholder="@username" value={handle}
                onChange={(e) => setHandle(e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Platform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="twitter">Twitter / X</SelectItem>
                    <SelectItem value="onlyfans">OnlyFans</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Followers</Label>
                <Input type="number" placeholder="optional" value={followers}
                  onChange={(e) => setFollowers(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button className="w-full" onClick={finishWithLead}
              disabled={!handle.trim() || busy}>
              {busy ? "Saving…" : "Save Lead"}
            </Button>
          </div>
        )}

        {step === "ready" && (
          <div className="space-y-3 text-center py-6">
            <div className="text-4xl">✅</div>
            <h2 className="text-xl font-semibold">Your execution system is ready.</h2>
            <p className="text-sm text-muted-foreground">Opening your dashboard…</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Steps({ current }: { current: Step }) {
  const order: Step[] = ["language", "identity", "mode", "workspace", "positioning", "lead", "ready"];
  const eff = current === "join" ? "workspace" : current;
  const idx = order.indexOf(eff);
  return (
    <div className="flex gap-1.5 mb-2">
      {order.map((s, i) => (
        <div key={s} className={`h-1 w-6 rounded-full ${i <= idx ? "bg-primary" : "bg-border"}`} />
      ))}
    </div>
  );
}
