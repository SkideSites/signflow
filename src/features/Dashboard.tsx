import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { CircularProgress } from "@/components/CircularProgress";
import {
  Flame, AlertTriangle, Snowflake, PhoneCall, ChevronRight, Plus, ChevronDown, Users,
  Info, ArrowRight, CheckCircle2, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ManageWorkspaceDialog } from "./ManageWorkspace";
import { completeAction, type Lead, type NextAction } from "@/lib/leadActions";
import { toast } from "sonner";

type Stage = "TO_CONTACT" | "CONTACTED" | "REPLIED" | "CALL_BOOKED" | "NEGOTIATING" | "SIGNED" | "LOST";

const HINT_KEY = "signflow:hints_seen";
function hasSeen(k: string) {
  if (typeof window === "undefined") return true;
  try { return (JSON.parse(localStorage.getItem(HINT_KEY) || "{}") as Record<string, boolean>)[k] === true; } catch { return true; }
}
function markSeen(k: string) {
  if (typeof window === "undefined") return;
  try {
    const o = JSON.parse(localStorage.getItem(HINT_KEY) || "{}") as Record<string, boolean>;
    o[k] = true; localStorage.setItem(HINT_KEY, JSON.stringify(o));
  } catch { /* noop */ }
}

const ACTION_LABELS: Record<string, string> = {
  send_first_message: "Send first message",
  follow_up: "Send follow-up",
  re_engage: "Re-engage cooling lead",
  reply: "Reply to message",
  call_prep: "Prepare for call",
  call_completed: "Log call result",
};
const ACTION_VERB: Record<string, string> = {
  send_first_message: "Contact",
  follow_up: "Follow up with",
  re_engage: "Re-engage",
  reply: "Reply to",
  call_prep: "Prepare call with",
  call_completed: "Log call with",
};

export function Dashboard() {
  const { current } = useWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [quickOpen, setQuickOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ action: NextAction; lead: Lead } | null>(null);

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

  const { data: actions = [] } = useQuery({
    queryKey: ["next-actions", current?.id, user?.id],
    enabled: !!current && !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from("next_actions")
        .select("*, leads:lead_id(*)")
        .eq("workspace_id", current!.id)
        .is("completed_at", null)
        .lte("due_at", nowIso)
        .or(`assigned_to.is.null,assigned_to.eq.${user!.id},user_id.eq.${user!.id}`)
        .order("priority", { ascending: true })
        .order("due_at", { ascending: true })
        .limit(20);
      return (data ?? []) as Array<NextAction & { leads: Lead | null }>;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", current?.id],
    enabled: !!current,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: leads } = await supabase
        .from("leads").select("stage").eq("workspace_id", current!.id);
      const counts: Record<Stage, number> = {
        TO_CONTACT: 0, CONTACTED: 0, REPLIED: 0, CALL_BOOKED: 0, NEGOTIATING: 0, SIGNED: 0, LOST: 0,
      };
      (leads ?? []).forEach((l) => { counts[l.stage as Stage] += 1; });
      return { journey: counts, totalLeads: (leads ?? []).length };
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
  const targetContacts = ws.daily_target_contacts ?? 25;
  const targetFollowups = ws.daily_target_followups ?? 10;
  const totalDone = contacts + followups;
  const totalTarget = Math.max(1, targetContacts + targetFollowups);
  const executionScore = Math.min(100, Math.round((totalDone / totalTarget) * 100));
  const allDone = contacts >= targetContacts && followups >= targetFollowups;
  const streak = progress?.streak ?? 0;

  // categorize actions
  const buckets = useMemo(() => {
    const overdue: typeof actions = [];
    const cooling: typeof actions = [];
    const calls: typeof actions = [];
    const other: typeof actions = [];
    const nowMs = Date.now();
    const dayAgo = nowMs - 86400_000;
    for (const a of actions) {
      if (a.type === "call_prep" || a.type === "call_completed") calls.push(a);
      else if (a.type === "follow_up" && new Date(a.due_at).getTime() < dayAgo) overdue.push(a);
      else if (a.type === "re_engage") cooling.push(a);
      else other.push(a);
    }
    return { overdue, cooling, calls, other };
  }, [actions]);

  const priorityList = useMemo(() => {
    return [...buckets.overdue, ...buckets.calls, ...buckets.other, ...buckets.cooling].slice(0, 5);
  }, [buckets]);

  const todaysPriority = priorityList[0] ?? null;

  const executionMsg = useMemo(() => {
    if (allDone) return "High execution momentum.";
    if (executionScore >= 80) return "Strong follow-up activity.";
    if (executionScore >= 50) return "Steady pace. Keep going.";
    if (buckets.overdue.length > 0) return "A few deals are stalling — your follow-ups need attention.";
    if (executionScore > 0) return "Momentum is building.";
    return "Let's start. One action will move you forward.";
  }, [executionScore, allDone, buckets.overdue.length]);

  const dailyWin = useMemo(() => {
    if (buckets.overdue.length === 0 && allDone) return "You executed every priority today.";
    if (buckets.cooling.length === 0) return "No lead was left cooling today.";
    return "You stayed consistent today.";
  }, [buckets, allDone]);

  const totalLeads = stats?.totalLeads ?? 0;
  const isEmpty = totalLeads === 0;
  const journey = stats?.journey;
  const noActions = actions.length === 0;
  const fullyDone = !isEmpty && noActions && allDone;

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-3xl mx-auto space-y-10 relative">
      {/* 1. Execution Score */}
      <section className="text-center space-y-3">
        <div className="flex items-center justify-center gap-1.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Execution Score</div>
          <HintOnce id="exec-score">
            A behavioral signal of your daily momentum. The more priorities you complete, the higher it climbs. It resets every day.
          </HintOnce>
        </div>
        <div className="text-7xl md:text-8xl font-semibold tabular-nums leading-none">
          {executionScore}
          <span className="text-2xl text-muted-foreground font-normal align-top ml-1">/100</span>
        </div>
        <div className="max-w-md mx-auto h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-primary transition-all duration-700" style={{ width: `${executionScore}%` }} />
        </div>
        <p className="text-sm text-muted-foreground">{executionMsg}</p>
        {streak > 0 && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/25 text-xs">
            <Flame className="size-3.5 text-primary" /> {streak} day streak
          </div>
        )}
      </section>

      {/* 2. Daily Objectives */}
      <section className="elevated-card p-6">
        <div className="flex items-center justify-around flex-wrap gap-6">
          <CircularProgress value={contacts} max={targetContacts || 1} label="Daily Contacts" />
          <CircularProgress value={followups} max={targetFollowups || 1} label="Daily Follow-ups" />
        </div>
      </section>

      {/* 3. Today's Priority — single most important action */}
      {fullyDone ? (
        <section className="elevated-card p-8 text-center space-y-4">
          <div className="text-3xl">🎯</div>
          <h2 className="text-xl font-semibold">You're done for today.</h2>
          <p className="text-sm text-muted-foreground">
            Come back tomorrow. We'll tell you exactly what deserves your attention.
          </p>
          <div className="pt-3 border-t border-border mt-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">Today's win</div>
            <p className="text-sm">{dailyWin}</p>
          </div>
        </section>
      ) : isEmpty ? (
        <section className="elevated-card p-8 text-center space-y-4">
          <p className="text-sm">No execution needed right now.</p>
          <p className="text-xs text-muted-foreground">Add a lead or wait for follow-ups.</p>
          <Button onClick={() => setQuickOpen(true)}><Plus className="size-4" /> Add Lead</Button>
        </section>
      ) : todaysPriority ? (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground px-1">
            <span>Today's priority</span>
          </div>
          <button
            onClick={() => setConfirmAction({ action: todaysPriority, lead: todaysPriority.leads! })}
            className="w-full elevated-card p-5 text-left transition hover:bg-surface-hover ring-1 ring-primary/40 group"
          >
            <div className="flex items-start gap-4">
              <div className="size-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                <MessageSquare className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-primary font-medium mb-1">
                  {ACTION_LABELS[todaysPriority.type] ?? todaysPriority.type}
                </div>
                <div className="text-base font-medium truncate">
                  {ACTION_VERB[todaysPriority.type] ?? "Action with"} @{todaysPriority.leads?.handle ?? "lead"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {todaysPriority.leads?.platform} · execute now
                </div>
              </div>
              <ArrowRight className="size-5 text-muted-foreground group-hover:text-primary transition" />
            </div>
          </button>
        </section>
      ) : null}

      {/* 4. Next Actions (max 5, excluding priority) */}
      {priorityList.length > 1 && (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground px-1">
            <span>Next actions</span>
            <HintOnce id="next-actions">
              Up to five high-signal actions ranked by urgency. Click any to open it directly — never the pipeline.
            </HintOnce>
          </div>
          <div className="space-y-2">
            {priorityList.slice(1).map((a) => (
              <ActionRow
                key={a.id}
                action={a}
                onClick={() => setConfirmAction({ action: a, lead: a.leads! })}
              />
            ))}
          </div>
        </section>
      )}

      {/* Bucket summary chips — only when relevant */}
      {!fullyDone && !isEmpty && (
        <section className="grid grid-cols-3 gap-2">
          <Chip icon={AlertTriangle} tone="warning" label="Overdue" n={buckets.overdue.length} />
          <Chip icon={Snowflake} tone="muted" label="Cooling" n={buckets.cooling.length} />
          <Chip icon={PhoneCall} tone="primary" label="Calls" n={buckets.calls.length} />
        </section>
      )}

      {/* 5. Workspace */}
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

      {/* Add Lead button */}
      <section>
        <Button size="lg" className="w-full" onClick={() => setQuickOpen(true)}>
          <Plus className="size-5" /> Add Lead
        </Button>
      </section>

      {/* 6. Journey (collapsed) */}
      <section>
        <Collapsible open={journeyOpen} onOpenChange={setJourneyOpen}>
          <CollapsibleTrigger className="w-full flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted-foreground px-1 py-2 hover:text-foreground transition">
            <span className="flex items-center gap-1.5">
              Journey to next signature
              <HintOnce id="journey">
                A long-term view of your pipeline pressure. Use it weekly — not daily.
              </HintOnce>
            </span>
            <ChevronDown className={`size-4 transition-transform ${journeyOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="elevated-card p-5 mt-2 space-y-4">
              <JourneyBar label="Contacted"
                value={(journey?.CONTACTED ?? 0) + (journey?.REPLIED ?? 0) + (journey?.CALL_BOOKED ?? 0) + (journey?.NEGOTIATING ?? 0) + (journey?.SIGNED ?? 0)}
                target={Math.max(10, targetContacts)} />
              <JourneyBar label="Responses"
                value={(journey?.REPLIED ?? 0) + (journey?.CALL_BOOKED ?? 0) + (journey?.NEGOTIATING ?? 0) + (journey?.SIGNED ?? 0)}
                target={Math.max(3, Math.round(targetContacts / 3))} />
              <JourneyBar label="Deals closed"
                value={journey?.SIGNED ?? 0}
                target={Math.max(1, Math.round(targetContacts / 9))} />
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
      <ActionConfirmDialog
        item={confirmAction}
        onClose={() => setConfirmAction(null)}
        onDone={() => {
          setConfirmAction(null);
          qc.invalidateQueries();
        }}
      />
    </div>
  );
}

function HintOnce({ id, children }: { id: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(!hasSeen(id));
  if (hasSeen(id) && !open) return null;
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) markSeen(id); }}>
      <PopoverTrigger asChild>
        <button className="text-muted-foreground/70 hover:text-foreground" aria-label="What is this?">
          <Info className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 text-xs" align="start" sideOffset={6}>
        <p className="text-muted-foreground leading-relaxed">{children}</p>
        <button onClick={() => { markSeen(id); setOpen(false); }}
          className="text-primary text-[11px] mt-2 hover:underline">Got it</button>
      </PopoverContent>
    </Popover>
  );
}

function Chip({ icon: Icon, tone, label, n }: {
  icon: typeof Flame; tone: "warning" | "primary" | "muted"; label: string; n: number;
}) {
  const col = tone === "warning" ? "text-warning" : tone === "primary" ? "text-primary" : "text-muted-foreground";
  return (
    <div className="surface-panel px-3 py-2.5 flex items-center gap-2">
      <Icon className={`size-3.5 ${col}`} />
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="ml-auto text-sm font-semibold tabular-nums">{n}</span>
    </div>
  );
}

function ActionRow({
  action, onClick,
}: { action: NextAction & { leads: Lead | null }; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full elevated-card p-3.5 flex items-center gap-3 text-left transition hover:bg-surface-hover">
      <div className="size-8 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
        <MessageSquare className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {ACTION_VERB[action.type] ?? "Action with"} @{action.leads?.handle ?? "lead"}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {ACTION_LABELS[action.type] ?? action.type}
        </div>
      </div>
      <ChevronRight className="size-4 text-muted-foreground" />
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

function ActionConfirmDialog({
  item, onClose, onDone,
}: {
  item: { action: NextAction; lead: Lead } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!item) return null;

  const verb = ACTION_LABELS[item.action.type] ?? item.action.type;

  const yes = async () => {
    if (!user) return;
    setBusy(true);
    try {
      // Determine stage transition based on action type
      let newStage: Lead["stage"] | undefined;
      if (item.action.type === "send_first_message") newStage = "CONTACTED";
      else if (item.action.type === "call_completed") newStage = "NEGOTIATING";

      await completeAction({
        action: item.action,
        lead: item.lead,
        user_id: user.id,
        newStage,
        bumpContact: item.action.type !== "call_completed",
        scheduleFollowUp: item.action.type !== "call_completed",
      });
      toast.success("Logged. Next action generated.");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    if (!user) return;
    setBusy(true);
    try {
      // Snooze: push due_at by 1 day instead of completing
      const newDue = new Date(Date.now() + 86400_000).toISOString();
      await supabase.from("next_actions").update({ due_at: newDue }).eq("id", item.action.id);
      toast("Snoozed to tomorrow.");
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-primary" /> {verb}
          </DialogTitle>
          <DialogDescription>
            Lead: <span className="text-foreground font-medium">@{item.lead.handle}</span> · {item.lead.platform}
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm text-muted-foreground py-2">
          Did you complete this action?
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={skip} disabled={busy}>Not yet</Button>
          <Button onClick={yes} disabled={busy}>Yes, done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
