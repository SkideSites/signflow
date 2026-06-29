import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LANGUAGES, getLang, setLang, type LangCode } from "@/lib/i18n";
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

type Step = "language" | "welcome" | "workspace" | "goals" | "lead" | "ready";

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const { workspaces, current, setCurrentId, refresh } = useWorkspace();
  const [step, setStep] = useState<Step>("language");
  const [lang, setLangState] = useState<LangCode>(getLang());
  const [wsName, setWsName] = useState("");
  const [targetContacts, setTargetContacts] = useState(25);
  const [targetFollowups, setTargetFollowups] = useState(10);
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [followers, setFollowers] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (current?.name && !wsName) setWsName(current.name);
  }, [current?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseLang = (c: LangCode) => {
    setLangState(c);
    setLang(c);
    setStep("welcome");
  };

  const saveWorkspace = async () => {
    if (!user || !wsName.trim()) return;
    setBusy(true);
    try {
      let wsId = current?.id;
      if (!wsId) {
        const { data, error } = await supabase
          .from("workspaces")
          .insert({ name: wsName.trim(), type: "personal", owner_id: user.id })
          .select()
          .single();
        if (error) throw error;
        await supabase
          .from("workspace_members")
          .insert({ workspace_id: data.id, user_id: user.id, role: "owner" });
        wsId = data.id;
      } else if (current && current.name !== wsName.trim()) {
        await supabase.from("workspaces").update({ name: wsName.trim() }).eq("id", current.id);
      }
      await refresh();
      if (wsId) setCurrentId(wsId);
      setStep("goals");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveGoals = async () => {
    if (!current) {
      setStep("lead");
      return;
    }
    setBusy(true);
    try {
      await supabase
        .from("workspaces")
        .update({
          daily_target_contacts: Math.max(1, Math.min(500, Number(targetContacts) || 25)),
          daily_target_followups: Math.max(1, Math.min(500, Number(targetFollowups) || 10)),
        })
        .eq("id", current.id);
      await refresh();
      setStep("lead");
    } finally {
      setBusy(false);
    }
  };

  const saveLead = async () => {
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
      }, 1800);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const skipLead = () => {
    setStep("ready");
    setTimeout(() => {
      markOnboarded();
      onDone();
    }, 1500);
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
                <button
                  key={l.code}
                  onClick={() => chooseLang(l.code)}
                  className={`p-3 rounded-lg border text-sm transition ${
                    lang === l.code ? "border-primary bg-primary/10" : "border-border hover:bg-surface-hover"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "welcome" && (
          <div className="space-y-5 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">Welcome to Signflow 👋</h2>
            <p className="text-sm text-muted-foreground">Let's build your execution system.</p>
            <Button className="w-full" onClick={() => setStep("workspace")}>Continue</Button>
          </div>
        )}

        {step === "workspace" && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-center">What's your workspace name?</h2>
            <Input
              placeholder="John's Workspace"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              autoFocus
            />
            <Button className="w-full" onClick={saveWorkspace} disabled={!wsName.trim() || busy}>
              {current ? "Continue" : "Create Workspace"}
            </Button>
          </div>
        )}

        {step === "goals" && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-center">Set your daily goals</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Daily Contacts</Label>
                <Input type="number" min={1} value={targetContacts}
                  onChange={(e) => setTargetContacts(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Daily Follow-ups</Label>
                <Input type="number" min={1} value={targetFollowups}
                  onChange={(e) => setTargetFollowups(Number(e.target.value))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">You can change these anytime.</p>
            <Button className="w-full" onClick={saveGoals} disabled={busy}>Continue</Button>
          </div>
        )}

        {step === "lead" && (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-center">Let's add your first lead</h2>
            <div className="space-y-2">
              <Label className="text-xs">Handle</Label>
              <Input placeholder="@username" value={handle} onChange={(e) => setHandle(e.target.value)} autoFocus />
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
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={skipLead} disabled={busy}>Skip</Button>
              <Button className="flex-1" onClick={saveLead} disabled={!handle.trim() || busy}>Save Lead</Button>
            </div>
          </div>
        )}

        {step === "ready" && (
          <div className="space-y-4 text-center py-4">
            <div className="text-3xl">✅</div>
            <h2 className="text-xl font-semibold">Your execution system is ready.</h2>
            <p className="text-sm text-muted-foreground">Good luck. Let's close some deals.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Steps({ current }: { current: Step }) {
  const order: Step[] = ["language", "welcome", "workspace", "goals", "lead", "ready"];
  const idx = order.indexOf(current);
  return (
    <div className="flex gap-1.5 mb-2">
      {order.map((s, i) => (
        <div key={s} className={`h-1 w-6 rounded-full ${i <= idx ? "bg-primary" : "bg-border"}`} />
      ))}
    </div>
  );
}
