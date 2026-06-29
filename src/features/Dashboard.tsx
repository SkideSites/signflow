import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { CircularProgress } from "@/components/CircularProgress";
import {
  Flame, AlertTriangle, Snowflake, PhoneCall, ChevronRight, Plus, ChevronDown, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ManageWorkspaceDialog } from "./ManageWorkspace";
import { toast } from "sonner";

type Stage = "TO_CONTACT" | "CONTACTED" | "REPLIED" | "CALL_BOOKED" | "NEGOTIATING" | "SIGNED" | "LOST";

export function Dashboard() {
  const { current } = useWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [quickOpen, setQuickOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const { data: progress } = useQuery({
    queryKey: ["progress", current?.id, user?.id, today],
    enabled: !!current && !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_progress").select("*")
        .eq("workspace_id", current!.id).eq("user_id", user!.id).eq("date", today)
        .maybeSingle();
      return data;
    },
  });

  const { data: yesterdayProgress } = useQuery({
    queryKey: ["progress-y", current?.id, user?.id],
    enabled: !!current && !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_progress").select("streak")
        .eq("workspace_id", current!.id).eq("user_id", user!.id)
        .lt("date", today).order("date", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", current?.id],
    enabled: !!current,
    refetchInterval: 60_000,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const sevenAgoIso = new Date(Date.now() - 7 * 86400_000).toISOString();
      const [overdue, cooling, calls, journey] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("workspace_id", current!.id)
          .lt("next_follow_up_at", nowIso)
          .not("stage", "in", "(SIGNED,LOST)"),
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("workspace_id", current!.id).eq("stage", "CONTACTED")
          .lt("last_contact_at", sevenAgoIso),
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("workspace_id", current!.id).eq("stage", "CALL_BOOKED"),
        supabase.from("leads").select("stage").eq("workspace_id", current!.id),
      ]);
      const counts: Record<Stage, number> = {
        TO_CONTACT: 0, CONTACTED: 0, REPLIED: 0, CALL_BOOKED: 0, NEGOTIATING: 0, SIGNED: 0, LOST: 0,
      };
      (journey.data ?? []).forEach((l) => { counts[l.stage as Stage] += 1; });
      return {
        overdue: overdue.count ?? 0,
        cooling: cooling.count ?? 0,
        calls: calls.count ?? 0,
        journey: counts,
        totalLeads: (journey.data ?? []).length,
      };
    },
  });

  const { data: memberCount = 1 } = useQuery({
    queryKey: ["ws-member-count", current?.id],
    enabled: !!current,
    queryFn: async () => {
      const { count } = await supabase.from("workspace_members")
        .select("user_id", { count: "exact", head: true })
        .eq("workspace_id", current!.id);
      return count ?? 1;
    },
  });

  const ws = current!;
  const contacts = progress?.leads_contacted ?? 0;
  const followups = progress?.followups_completed ?? 0;
  const targetContacts = ws?.daily_target_contacts ?? 25;
  const targetFollowups = ws?.daily_target_followups ?? 10;
  const allDone = contacts >= targetContacts && followups >= targetFollowups;
  const streak = progress?.streak ?? (yesterdayProgress as { streak?: number } | null)?.streak ?? 0;

  const totalDone = contacts + followups;
  const totalTarget = Math.max(1, targetContacts + targetFollowups);
  const executionScore = Math.min(100, Math.round((totalDone / totalTarget) * 100));

  const executionMsg = useMemo(() => {
    const remainingContacts = Math.max(0, targetContacts - contacts);
    const remainingFollowups = Math.max(0, targetFollowups - followups);
    if (allDone) return "🎉 Daily goals completed. Time to close more deals.";
    if (executionScore >= 80) return "Strong execution today.";
    if (executionScore >= 50) return "You're close to today's target.";
    if (remainingContacts > 0 && remainingContacts <= 3) return `${remainingContacts} more contacts will put you back on track.`;
    if (remainingFollowups > 0 && remainingFollowups <= 3) return `${remainingFollowups} more follow-ups will put you back on track.`;
    if (executionScore > 0) return "Keep going — momentum is building.";
    return "Let's get started. Hit your first contact today.";
  }, [executionScore, allDone, targetContacts, contacts, targetFollowups, followups]);

  const objectivesMsg = allDone
    ? "🎉 Daily goals completed."
    : (targetContacts - contacts) <= 3 && (targetContacts - contacts) > 0
      ? `Only ${targetContacts - contacts} contacts left today.`
      : executionScore >= 50 ? "Great pace." : "Keep going.";

  const totalLeads = stats?.totalLeads ?? 0;
  const isEmpty = totalLeads === 0;
  const journey = stats?.journey;

  // Smart Priority — pick the single most urgent action
  const priority: "overdue" | "cooling" | "calls" | null = useMemo(() => {
    if (!stats) return null;
    if (stats.overdue > 0) return "overdue";
    if (stats.calls > 0) return "calls";
    if (stats.cooling > 0) return "cooling";
    return null;
  }, [stats]);

  const goPipeline = () => navigate({ to: "/pipeline" });

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-3xl mx-auto space-y-10 relative">
      {/* SECTION 1 — Execution Score */}
      <section className="text-center space-y-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Execution Score</div>
        <div className="text-7xl md:text-8xl font-semibold tabular-nums leading-none">
          {executionScore}
          <span className="text-2xl text-muted-foreground font-normal align-top ml-1">/100</span>
        </div>
        <div className="max-w-md mx-auto h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-700"
            style={{ width: `${executionScore}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground">{executionMsg}</p>
        {streak > 0 && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/25 text-xs">
            <Flame className="size-3.5 text-primary" /> {streak} day streak
          </div>
        )}
      </section>

      {/* SECTION 2 — Daily Objectives */}
      <section className="elevated-card p-6">
        <div className="flex items-center justify-around flex-wrap gap-6">
          <CircularProgress value={contacts} max={targetContacts || 1} label="Daily Contacts" />
          <CircularProgress value={followups} max={targetFollowups || 1} label="Daily Follow-ups" />
        </div>
        <div className="text-center text-xs text-muted-foreground mt-4">{objectivesMsg}</div>
      </section>

      {/* SECTION 3 — Next Actions */}
      <section className="space-y-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground px-1">Next actions</div>
        {isEmpty ? (
          <div className="elevated-card p-8 text-center space-y-3">
            <div className="text-sm text-muted-foreground">Let's add your first lead.</div>
            <Button onClick={() => setQuickOpen(true)}><Plus className="size-4" /> Add Lead</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <ActionRow
              icon={AlertTriangle}
              label="Overdue Follow-ups"
              count={stats?.overdue ?? 0}
              tone="warning"
              highlight={priority === "overdue"}
              onClick={goPipeline}
            />
            <ActionRow
              icon={Snowflake}
              label="Cooling Leads"
              count={stats?.cooling ?? 0}
              tone="muted"
              highlight={priority === "cooling"}
              onClick={goPipeline}
            />
            <ActionRow
              icon={PhoneCall}
              label="Calls Today"
              count={stats?.calls ?? 0}
              tone="primary"
              highlight={priority === "calls"}
              onClick={goPipeline}
            />
            {!priority && (
              <p className="text-xs text-muted-foreground text-center pt-2">Great job. You're all caught up.</p>
            )}
          </div>
        )}
      </section>

      {/* SECTION 4 — Workspace */}
      <section className="elevated-card p-4 flex items-center gap-3">
        <div className="size-9 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
          <Users className="size-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{ws.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setManageOpen(true)}>
          Manage <ChevronRight className="size-4" />
        </Button>
      </section>

      {/* SECTION 5 — Add Lead */}
      <section>
        <Button size="lg" className="w-full" onClick={() => setQuickOpen(true)}>
          <Plus className="size-5" /> Add Lead
        </Button>
      </section>

      {/* SECTION 6 — Journey (collapsed) */}
      <section>
        <Collapsible open={journeyOpen} onOpenChange={setJourneyOpen}>
          <CollapsibleTrigger className="w-full flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted-foreground px-1 py-2 hover:text-foreground transition">
            <span>Journey to next signature</span>
            <ChevronDown className={`size-4 transition-transform ${journeyOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="elevated-card p-5 mt-2 space-y-4">
              <JourneyBar label="Contacts"
                value={(journey?.CONTACTED ?? 0) + (journey?.REPLIED ?? 0) + (journey?.CALL_BOOKED ?? 0) + (journey?.NEGOTIATING ?? 0) + (journey?.SIGNED ?? 0)}
                target={targetContacts || 10} />
              <JourneyBar label="Follow-ups"
                value={(journey?.REPLIED ?? 0) + (journey?.CALL_BOOKED ?? 0) + (journey?.NEGOTIATING ?? 0) + (journey?.SIGNED ?? 0)}
                target={Math.max(5, Math.round((targetContacts || 10) / 3))} />
              <JourneyBar label="Deals Closed"
                value={journey?.SIGNED ?? 0}
                target={Math.max(1, Math.round((targetContacts || 10) / 9))} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </section>

      <ManageWorkspaceDialog open={manageOpen} onOpenChange={setManageOpen} />

      <QuickAddDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onCreated={() => qc.invalidateQueries()}
      />
    </div>
  );
}

function ActionRow({
  icon: Icon, label, count, tone, highlight, onClick,
}: {
  icon: typeof Flame; label: string; count: number;
  tone: "warning" | "primary" | "muted"; highlight: boolean; onClick: () => void;
}) {
  const toneCol = tone === "warning" ? "text-warning" : tone === "primary" ? "text-primary" : "text-muted-foreground";
  return (
    <button
      onClick={onClick}
      className={`w-full elevated-card p-4 flex items-center gap-4 transition-all hover:bg-surface-hover text-left ${
        highlight ? "ring-2 ring-primary/50 border-primary/40" : ""
      }`}
    >
      <div className={`size-9 rounded-md bg-secondary flex items-center justify-center ${toneCol}`}>
        <Icon className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
      </div>
      <div className="flex items-center gap-2">
        {highlight && count > 0 && (
          <span className="text-[10px] uppercase tracking-wider text-primary font-medium">Focus here</span>
        )}
        <span className="text-2xl font-semibold tabular-nums">{count}</span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>
    </button>
  );
}

function JourneyBar({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, target)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{value} <span className="text-muted-foreground">/ {target}</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function QuickAddDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const { current } = useWorkspace();
  const { user } = useAuth();
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [followers, setFollowers] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!current || !user || !handle.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("leads").insert({
      workspace_id: current.id,
      handle: handle.trim().replace(/^@/, ""),
      platform: platform as never,
      followers: followers ? Number(followers) : 0,
      notes: notes.trim() || null,
      stage: "TO_CONTACT",
      created_by: user.id,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Lead added");
    setHandle(""); setFollowers(""); setNotes("");
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add lead</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Handle</Label>
            <Input placeholder="@username" value={handle} onChange={(e) => setHandle(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <Label className="text-xs">Followers</Label>
              <Input type="number" placeholder="optional" value={followers} onChange={(e) => setFollowers(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Input placeholder="optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!handle.trim() || busy}>Add Lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
