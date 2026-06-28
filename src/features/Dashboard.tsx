import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { CircularProgress } from "@/components/CircularProgress";
import { Flame, AlertTriangle, Snowflake, PhoneCall, ChevronRight, Check } from "lucide-react";
import { ACTION_LABELS, JOURNEY_STAGES, STAGE_LABELS, formatFollowers, isOverdue, timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LeadDrawer } from "./LeadDrawer";
import { completeAction } from "@/lib/leadActions";
import type { Lead, NextAction, Stage } from "@/lib/leadActions";
import { toast } from "sonner";

type ActionWithLead = NextAction & { lead: Lead };

export function Dashboard() {
  const { current } = useWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "overdue" | "cooling" | "calls">("all");

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
      const y = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
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
      };
    },
  });

  const ws = current!;
  const contacts = progress?.leads_contacted ?? 0;
  const followups = progress?.followups_completed ?? 0;
  const targetContacts = ws.daily_target_contacts;
  const targetFollowups = ws.daily_target_followups;
  const allDone = contacts >= targetContacts && followups >= targetFollowups;
  const streak = useMemo(() => {
    if (progress?.streak) return progress.streak;
    return (yesterdayProgress as { streak?: number } | null)?.streak ?? 0;
  }, [progress, yesterdayProgress]);

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
  const journeyTotal = journey
    ? journey.CONTACTED + journey.REPLIED + journey.CALL_BOOKED + journey.NEGOTIATING + journey.SIGNED
    : 0;

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-6xl mx-auto space-y-8">
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

      {/* Daily Objectives */}
      <section className="elevated-card p-6">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-4">Daily objectives</div>
        <div className="flex items-center justify-around flex-wrap gap-6">
          <CircularProgress value={contacts} max={targetContacts} label="Leads contacted" />
          <CircularProgress value={followups} max={targetFollowups} label="Follow-ups" />
        </div>
        {allDone && (
          <div className="text-center text-sm text-success mt-4">Both objectives complete — streak secured.</div>
        )}
      </section>

      {/* Urgent alerts */}
      <section className="grid grid-cols-3 gap-3">
        <AlertCard
          icon={AlertTriangle}
          label="Overdue follow-ups"
          count={stats?.overdue ?? 0}
          active={filter === "overdue"}
          onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")}
          tone="warning"
        />
        <AlertCard
          icon={Snowflake}
          label="Cooling leads"
          count={stats?.cooling ?? 0}
          active={filter === "cooling"}
          onClick={() => setFilter(filter === "cooling" ? "all" : "cooling")}
          tone="muted"
        />
        <AlertCard
          icon={PhoneCall}
          label="Calls today"
          count={stats?.calls ?? 0}
          active={filter === "calls"}
          onClick={() => setFilter(filter === "calls" ? "all" : "calls")}
          tone="primary"
        />
      </section>

      {/* Journey to signature */}
      <section className="elevated-card p-5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Journey to signature</div>
        <div className="flex w-full rounded-md overflow-hidden border border-border">
          {JOURNEY_STAGES.map((s, i) => {
            const c = journey?.[s] ?? 0;
            const pct = journeyTotal ? Math.max(8, Math.round((c / journeyTotal) * 100)) : 25;
            const isLast = i === JOURNEY_STAGES.length - 1;
            return (
              <div
                key={s}
                className={`px-3 py-3 text-xs flex-1 ${isLast ? "bg-primary/20 text-primary" : "bg-surface"}`}
                style={{ flexBasis: `${pct}%` }}
              >
                <div className="font-medium">{STAGE_LABELS[s]}</div>
                <div className="text-muted-foreground tabular-nums">{c}</div>
              </div>
            );
          })}
        </div>
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
              Nothing due right now. Add leads or come back later.
            </div>
          )}
          {filtered.map((a) => (
            <div key={a.id} className="elevated-card p-3 flex items-center gap-3 group">
              <button
                onClick={() => doAction(a)}
                className="size-7 rounded-full border-2 border-border hover:border-primary hover:bg-primary/10 flex items-center justify-center shrink-0 transition-colors"
                aria-label="Complete"
              >
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
        {journeyTotal === 0 && (journey?.SIGNED ?? 0) === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            Start adding leads to track your journey
          </div>
        ) : (
          <div className="space-y-4">
            <JourneyBar
              label="Leads contacted"
              value={(journey?.CONTACTED ?? 0) + (journey?.REPLIED ?? 0) + (journey?.CALL_BOOKED ?? 0) + (journey?.NEGOTIATING ?? 0) + (journey?.SIGNED ?? 0)}
              target={targetContacts}
            />
            <JourneyBar
              label="Responses received"
              value={(journey?.REPLIED ?? 0) + (journey?.CALL_BOOKED ?? 0) + (journey?.NEGOTIATING ?? 0) + (journey?.SIGNED ?? 0)}
              target={Math.max(5, Math.round(targetContacts / 3))}
            />
            <JourneyBar
              label="Deals closed"
              value={journey?.SIGNED ?? 0}
              target={Math.max(1, Math.round(targetContacts / 9))}
            />
          </div>
        )}
      </section>

      <LeadDrawer leadId={openLead} onClose={() => setOpenLead(null)} />
    </div>
  );
}

function AlertCard({
  icon: Icon, label, count, active, onClick, tone,
}: { icon: typeof Flame; label: string; count: number; active: boolean; onClick: () => void; tone: "warning" | "primary" | "muted" }) {
  const toneClass =
    tone === "warning" ? "text-warning" : tone === "primary" ? "text-primary" : "text-muted-foreground";
  return (
    <button
      onClick={onClick}
      className={`elevated-card p-4 text-left transition-all ${active ? "ring-2 ring-primary/50" : "hover:bg-surface-hover"}`}
    >
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
        <span className="tabular-nums text-muted-foreground">
          {value}/{safeTarget} · {pct}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
