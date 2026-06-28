import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { CircularProgress } from "@/components/CircularProgress";
import { Flame, AlertTriangle, Snowflake, PhoneCall, ChevronRight, Check, Plus, Activity } from "lucide-react";
import { ACTION_LABELS, STAGE_LABELS, formatFollowers, isOverdue, timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeadDrawer } from "./LeadDrawer";
import { completeAction } from "@/lib/leadActions";
import type { Lead, NextAction, Stage } from "@/lib/leadActions";
import { toast } from "sonner";

type ActionWithLead = NextAction & { lead: Lead };

export function Dashboard() {
  const { current } = useWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "overdue" | "cooling" | "calls">("all");
  const [quickOpen, setQuickOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const { data: progress } = useQuery({
    queryKey: ["progress", current?.id, user?.id, today],
    enabled: !!current && !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_progress")
        .select("*")
        .eq("workspace_id", current!.id)
        .eq("user_id", user!.id)
        .eq("date", today)
        .maybeSingle();
      return data;
    },
  });

  const { data: yesterdayProgress } = useQuery({
    queryKey: ["progress-y", current?.id, user?.id],
    enabled: !!current && !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_progress")
        .select("streak")
        .eq("workspace_id", current!.id)
        .eq("user_id", user!.id)
        .lt("date", today)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: actions = [], isLoading: actionsLoading } = useQuery({
    queryKey: ["next-actions", current?.id],
    enabled: !!current,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("next_actions")
        .select("*, lead:leads(*)")
        .eq("workspace_id", current!.id)
        .is("completed_at", null)
        .lte("due_at", new Date().toISOString())
        .order("priority", { ascending: true })
        .order("due_at", { ascending: true })
        .limit(50);
      return ((data ?? []) as ActionWithLead[]).filter((a) => a.lead);
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", current?.id],
    enabled: !!current,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const sevenAgoIso = new Date(Date.now() - 7 * 86400_000).toISOString();
      const [overdue, cooling, calls, journey] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("workspace_id", current!.id)
          .lt("next_follow_up_at", nowIso)
          .not("stage", "in", "(SIGNED,LOST)"),
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("workspace_id", current!.id)
          .eq("stage", "CONTACTED")
          .lt("last_contact_at", sevenAgoIso),
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("workspace_id", current!.id)
          .eq("stage", "CALL_BOOKED"),
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

  // Last activity widgets
  const { data: recent } = useQuery({
    queryKey: ["recent-activity", current?.id],
    enabled: !!current,
    queryFn: async () => {
      const [lastLead, lastSigned, lastActivity] = await Promise.all([
        supabase.from("leads").select("handle, platform, created_at")
          .eq("workspace_id", current!.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("leads").select("handle, platform, updated_at")
          .eq("workspace_id", current!.id).eq("stage", "SIGNED")
          .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("activities").select("type, created_at, lead:leads(handle)")
          .eq("workspace_id", current!.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return {
        lastLead: lastLead.data,
        lastSigned: lastSigned.data,
        lastActivity: lastActivity.data as { type: string; created_at: string; lead: { handle: string } | null } | null,
      };
    },
  });

  const ws = current!;
  const contacts = progress?.leads_contacted ?? 0;
  const followups = progress?.followups_completed ?? 0;
  const targetContacts = ws?.daily_target_contacts ?? 0;
  const targetFollowups = ws?.daily_target_followups ?? 0;
  const allDone = targetContacts > 0 && contacts >= targetContacts && followups >= targetFollowups;
  const streak = useMemo(() => {
    if (progress?.streak) return progress.streak;
    return (yesterdayProgress as { streak?: number } | null)?.streak ?? 0;
  }, [progress, yesterdayProgress]);

  const focusPct = useMemo(() => {
    const a = targetContacts ? contacts / targetContacts : 0;
    const b = targetFollowups ? followups / targetFollowups : 0;
    return Math.round(((a + b) / 2) * 100);
  }, [contacts, followups, targetContacts, targetFollowups]);
  const focusMsg = focusPct >= 100 ? "Day cleared — nice." : focusPct >= 60 ? "You're on track." : focusPct > 0 ? "Keep pushing." : "You are behind today.";

  const filtered = useMemo(() => {
    if (!actions) return [];
    if (filter === "overdue") return actions.filter((a) => a.lead.next_follow_up_at && isOverdue(a.lead.next_follow_up_at));
    if (filter === "cooling") return actions.filter((a) => a.lead.stage === "CONTACTED");
    if (filter === "calls") return actions.filter((a) => a.type === "call_prep" || a.type === "call_completed");
    return actions.slice(0, 10);
  }, [actions, filter]);

  const doAction = async (a: ActionWithLead, method?: string) => {
    let newStage: Stage | undefined;
    if (a.type === "send_first_message" && a.lead.stage === "TO_CONTACT") newStage = "CONTACTED";
    if (a.type === "call_completed") newStage = "NEGOTIATING";
    await completeAction({ action: a, lead: a.lead, user_id: user!.id, newStage, method });
    qc.invalidateQueries();
    toast.success("Action completed");
  };

  const journey = stats?.journey;
  const totalLeads = stats?.totalLeads ?? 0;
  const isEmpty = totalLeads === 0;

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-6xl mx-auto space-y-8 relative">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="text-sm text-muted-foreground">Hit both targets to extend your streak.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30">
          <Flame className="size-4 text-primary" />
          <span className="text-sm font-medium">{streak} day streak</span>
        </div>
      </div>

      {/* Today Focus */}
      <section className="elevated-card p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Today focus</div>
          <div className="text-sm mt-1">
            <span className="tabular-nums font-medium">{Math.max(0, targetContacts - contacts)}</span> leads to contact ·{" "}
            <span className="tabular-nums font-medium">{Math.max(0, targetFollowups - followups)}</span> follow-ups pending
          </div>
        </div>
        <div className={`text-sm font-medium ${focusPct >= 60 ? "text-success" : focusPct > 0 ? "text-warning" : "text-muted-foreground"}`}>
          {focusMsg}
        </div>
      </section>

      {/* Daily Objectives */}
      <section className="elevated-card p-6">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-4">Daily objectives</div>
        <div className="flex items-center justify-around flex-wrap gap-6">
          <CircularProgress value={contacts} max={targetContacts || 1} label="Leads contacted" />
          <CircularProgress value={followups} max={targetFollowups || 1} label="Follow-ups" />
        </div>
        {allDone && (
          <div className="text-center text-sm text-success mt-4">Both objectives complete — streak secured.</div>
        )}
      </section>

      {/* Urgent alerts */}
      <section className="grid grid-cols-3 gap-3">
        <AlertCard icon={AlertTriangle} label="Overdue follow-ups" count={stats?.overdue ?? 0}
          active={filter === "overdue"} onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")} tone="warning" />
        <AlertCard icon={Snowflake} label="Cooling leads" count={stats?.cooling ?? 0}
          active={filter === "cooling"} onClick={() => setFilter(filter === "cooling" ? "all" : "cooling")} tone="muted" />
        <AlertCard icon={PhoneCall} label="Calls today" count={stats?.calls ?? 0}
          active={filter === "calls"} onClick={() => setFilter(filter === "calls" ? "all" : "calls")} tone="primary" />
      </section>

      {/* Mini funnel */}
      <section className="elevated-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Pipeline</div>
        {isEmpty ? (
          <EmptyState onAdd={() => setQuickOpen(true)} />
        ) : (
          <div className="grid grid-cols-4 gap-3">
            <FunnelCell label="To contact" count={journey?.TO_CONTACT ?? 0} total={totalLeads} />
            <FunnelCell label="Contacted" count={journey?.CONTACTED ?? 0} total={totalLeads} />
            <FunnelCell label="Responded" count={(journey?.REPLIED ?? 0) + (journey?.CALL_BOOKED ?? 0) + (journey?.NEGOTIATING ?? 0)} total={totalLeads} />
            <FunnelCell label="Closed" count={journey?.SIGNED ?? 0} total={totalLeads} accent />
          </div>
        )}
      </section>

      {/* Last activity */}
      <section className="elevated-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
          <Activity className="size-3" /> Last activity
        </div>
        {!recent?.lastLead && !recent?.lastSigned && !recent?.lastActivity ? (
          <div className="text-sm text-muted-foreground">No activity yet</div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <ActivityCell label="Last lead" main={recent?.lastLead ? `@${recent.lastLead.handle}` : "—"}
              sub={recent?.lastLead ? `${recent.lastLead.platform} · ${timeAgo(recent.lastLead.created_at) ?? ""}` : ""} />
            <ActivityCell label="Last update" main={recent?.lastActivity?.lead ? `@${recent.lastActivity.lead.handle}` : "—"}
              sub={recent?.lastActivity ? `${(ACTION_LABELS as Record<string,string>)[recent.lastActivity.type] ?? recent.lastActivity.type} · ${timeAgo(recent.lastActivity.created_at) ?? ""}` : ""} />
            <ActivityCell label="Last signed" main={recent?.lastSigned ? `@${recent.lastSigned.handle}` : "—"}
              sub={recent?.lastSigned ? `${recent.lastSigned.platform} · ${timeAgo(recent.lastSigned.updated_at) ?? ""}` : "No deals yet"} />
          </div>
        )}
      </section>

      {/* Next actions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Next actions</h2>
          <span className="text-xs text-muted-foreground">{filtered.length} due now</span>
        </div>
        <div className="space-y-2">
          {actionsLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!actionsLoading && filtered.length === 0 && (
            <div className="elevated-card p-8 text-center text-sm text-muted-foreground">
              {isEmpty ? (
                <div className="space-y-3">
                  <div>No leads yet. Start your pipeline.</div>
                  <Button size="sm" onClick={() => setQuickOpen(true)}><Plus className="size-4" /> Add your first lead</Button>
                </div>
              ) : "Nothing due right now. Come back later."}
            </div>
          )}
          {filtered.map((a) => (
            <div key={a.id} className="elevated-card p-3 flex items-center gap-3 group">
              <button onClick={() => doAction(a)}
                className="size-7 rounded-full border-2 border-border hover:border-primary hover:bg-primary/10 flex items-center justify-center shrink-0 transition-colors"
                aria-label="Complete">
                <Check className="size-3.5 opacity-0 group-hover:opacity-70 text-primary" />
              </button>
              <button onClick={() => setOpenLead(a.lead.id)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">@{a.lead.handle}</span>
                  <Badge variant="outline" className="text-[10px] uppercase">{a.lead.platform}</Badge>
                  {a.lead.next_follow_up_at && isOverdue(a.lead.next_follow_up_at) && (
                    <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">overdue</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {ACTION_LABELS[a.type] ?? a.type} · {formatFollowers(a.lead.followers)} followers · {timeAgo(a.lead.last_contact_at) ?? "no contact"}
                </div>
              </button>
              <Button size="sm" variant="ghost" onClick={() => setOpenLead(a.lead.id)}>
                Open <ChevronRight className="size-4 ml-0.5" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Journey to Next Signature */}
      <section className="elevated-card p-5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-4">
          Journey to next signature
        </div>
        {isEmpty ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-sm text-muted-foreground">Start adding leads to track your journey</div>
            <Button size="sm" onClick={() => setQuickOpen(true)}><Plus className="size-4" /> Add your first lead</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <JourneyBar label="Leads contacted"
              value={(journey?.CONTACTED ?? 0) + (journey?.REPLIED ?? 0) + (journey?.CALL_BOOKED ?? 0) + (journey?.NEGOTIATING ?? 0) + (journey?.SIGNED ?? 0)}
              target={targetContacts || 10} />
            <JourneyBar label="Responses received"
              value={(journey?.REPLIED ?? 0) + (journey?.CALL_BOOKED ?? 0) + (journey?.NEGOTIATING ?? 0) + (journey?.SIGNED ?? 0)}
              target={Math.max(5, Math.round((targetContacts || 10) / 3))} />
            <JourneyBar label="Deals closed"
              value={journey?.SIGNED ?? 0}
              target={Math.max(1, Math.round((targetContacts || 10) / 9))} />
          </div>
        )}
      </section>

      <LeadDrawer leadId={openLead} onClose={() => setOpenLead(null)} />

      {/* Floating quick add */}
      <button
        onClick={() => setQuickOpen(true)}
        className="fixed bottom-6 right-6 size-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform flex items-center justify-center z-40"
        aria-label="Quick add lead"
      >
        <Plus className="size-6" />
      </button>

      <QuickAddDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onCreated={() => { qc.invalidateQueries(); }}
        onFull={() => { setQuickOpen(false); navigate({ to: "/add-lead" }); }}
      />
    </div>
  );
}

function AlertCard({
  icon: Icon, label, count, active, onClick, tone,
}: { icon: typeof Flame; label: string; count: number; active: boolean; onClick: () => void; tone: "warning" | "primary" | "muted" }) {
  const toneClass = tone === "warning" ? "text-warning" : tone === "primary" ? "text-primary" : "text-muted-foreground";
  return (
    <button onClick={onClick}
      className={`elevated-card p-4 text-left transition-all ${active ? "ring-2 ring-primary/50" : "hover:bg-surface-hover"}`}>
      <div className="flex items-center justify-between">
        <Icon className={`size-4 ${toneClass}`} />
        <span className="text-2xl font-semibold tabular-nums">{count}</span>
      </div>
      <div className="text-xs text-muted-foreground mt-2">{label}</div>
    </button>
  );
}

function JourneyBar({ label, value, target }: { label: string; value: number; target: number }) {
  const safeTarget = Math.max(1, target);
  const pct = Math.min(100, Math.round((value / safeTarget) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-foreground/90">{label}</span>
        <span className="tabular-nums text-muted-foreground">{value}/{safeTarget} · {pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FunnelCell({ label, count, total, accent }: { label: string; count: number; total: number; accent?: boolean }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-muted-foreground truncate">{label}</span>
        <span className={`text-sm font-semibold tabular-nums ${accent ? "text-primary" : ""}`}>{count}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <div className={`h-full transition-all ${accent ? "bg-primary" : "bg-foreground/40"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ActivityCell({ label, main, sub }: { label: string; main: string; sub: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium truncate mt-0.5">{main}</div>
      <div className="text-xs text-muted-foreground truncate">{sub}</div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-4 space-y-3">
      <div className="text-sm text-muted-foreground">No leads yet</div>
      <Button size="sm" onClick={onAdd}><Plus className="size-4" /> Add your first lead</Button>
    </div>
  );
}

function QuickAddDialog({
  open, onOpenChange, onCreated, onFull,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void; onFull: () => void }) {
  const { current } = useWorkspace();
  const { user } = useAuth();
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState<"instagram" | "tiktok" | "twitter" | "youtube" | "onlyfans" | "other">("instagram");
  const [followers, setFollowers] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => { setHandle(""); setFollowers(""); setNotes(""); setPlatform("instagram"); };

  const m = useMutation({
    mutationFn: async () => {
      if (!current || !user) throw new Error("No workspace");
      const clean = handle.trim().replace(/^@/, "");
      if (!clean) throw new Error("Handle required");
      const { error } = await supabase.from("leads").insert({
        workspace_id: current.id,
        handle: clean,
        platform,
        followers: Number(followers) || 0,
        notes: notes.trim() || null,
        stage: "TO_CONTACT",
        created_by: user.id,
        assignee_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead added");
      reset();
      onCreated();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Quick add lead</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Handle</Label>
            <Input autoFocus value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@username" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="twitter">X / Twitter</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="onlyfans">OnlyFans</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Followers</Label>
              <Input inputMode="numeric" value={followers}
                onChange={(e) => setFollowers(e.target.value.replace(/[^0-9]/g, ""))} placeholder="50000" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Niche, context…" />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={onFull}>Full form</Button>
            <Button type="submit" disabled={m.isPending}>{m.isPending ? "Adding…" : "Add lead"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
