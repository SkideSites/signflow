import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { STAGES, STAGE_LABELS, formatFollowers, timeAgo } from "@/lib/format";
import { changeStage, markReplied } from "@/lib/leadActions";
import type { Lead, Activity, Stage } from "@/lib/leadActions";
import { generateDm } from "@/lib/ai.functions";
import { toast } from "sonner";

type Props = { leadId: string | null; onClose: () => void };

export function LeadDrawer({ leadId, onClose }: Props) {
  const { current } = useWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  const { data: lead } = useQuery({
    queryKey: ["lead", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("*").eq("id", leadId!).maybeSingle();
      return data as Lead | null;
    },
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["lead-activities", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data } = await supabase
        .from("activities")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as Activity[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["ws-members-profiles", current?.id],
    enabled: !!current,
    queryFn: async () => {
      const { data: m } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", current!.id);
      if (!m?.length) return [];
      const ids = m.map((x) => x.user_id);
      const { data: profiles } = await supabase.from("profiles").select("id,display_name,email").in("id", ids);
      return profiles ?? [];
    },
  });

  const saveNotes = async () => {
    if (!lead || notesDraft == null) return;
    await supabase.from("leads").update({ notes: notesDraft }).eq("id", lead.id);
    await supabase.from("activities").insert({
      workspace_id: lead.workspace_id, lead_id: lead.id, user_id: user!.id, type: "note_added",
    });
    setNotesDraft(null);
    qc.invalidateQueries({ queryKey: ["lead", lead.id] });
    qc.invalidateQueries({ queryKey: ["lead-activities", lead.id] });
    toast.success("Notes saved");
  };

  const onStageChange = async (s: Stage) => {
    if (!lead) return;
    await changeStage(lead, s, user!.id);
    qc.invalidateQueries();
    toast.success(`Moved to ${STAGE_LABELS[s]}`);
  };

  const onAssign = async (uid: string) => {
    if (!lead) return;
    await supabase.from("leads").update({ assignee_id: uid === "_none" ? null : uid }).eq("id", lead.id);
    await supabase.from("activities").insert({
      workspace_id: lead.workspace_id, lead_id: lead.id, user_id: user!.id, type: "assigned",
      meta: { to: uid },
    });
    qc.invalidateQueries();
  };

  const setFollowUp = async (v: string) => {
    if (!lead) return;
    await supabase.from("leads").update({ next_follow_up_at: v ? new Date(v).toISOString() : null }).eq("id", lead.id);
    qc.invalidateQueries();
  };

  const markReply = async () => {
    if (!lead) return;
    await markReplied(lead, user!.id);
    qc.invalidateQueries();
    toast.success("Marked as replied");
  };

  return (
    <Sheet open={!!leadId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-card border-border overflow-y-auto p-0">
        {!lead ? (
          <div className="p-6">Loading…</div>
        ) : (
          <>
            <SheetHeader className="px-6 py-4 border-b border-border">
              <SheetTitle className="flex items-center gap-2">
                <span className="text-lg">@{lead.handle}</span>
                <Badge variant="outline" className="text-[10px]">{lead.platform}</Badge>
              </SheetTitle>
              <div className="text-xs text-muted-foreground">
                {formatFollowers(lead.followers)} followers {lead.niche && `· ${lead.niche}`}
              </div>
            </SheetHeader>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Stage</label>
                  <Select value={lead.stage} onValueChange={(v) => onStageChange(v as Stage)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Assignee</label>
                  <Select value={lead.assignee_id ?? "_none"} onValueChange={onAssign}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Unassigned</SelectItem>
                      {members.map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>{m.display_name || m.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Follow-up date</label>
                  <Input
                    type="datetime-local"
                    className="mt-1"
                    value={lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toISOString().slice(0, 16) : ""}
                    onChange={(e) => setFollowUp(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {lead.stage !== "REPLIED" && lead.stage !== "SIGNED" && lead.stage !== "LOST" && (
                  <Button size="sm" variant="secondary" onClick={markReply}>Mark replied</Button>
                )}
              </div>

              <AiDmPanel lead={lead} />

              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</label>
                <Textarea
                  className="mt-1 min-h-28"
                  value={notesDraft ?? lead.notes ?? ""}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Autosave on save."
                />
                {notesDraft !== null && (
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={saveNotes}>Save notes</Button>
                    <Button size="sm" variant="ghost" onClick={() => setNotesDraft(null)}>Discard</Button>
                  </div>
                )}
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Activity history
                </div>
                <div className="space-y-1.5">
                  {activities.length === 0 && <div className="text-xs text-muted-foreground">No activity yet.</div>}
                  {activities.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-md bg-surface">
                      <span>{a.type.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground">{timeAgo(a.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AiDmPanel({ lead }: { lead: Lead }) {
  const gen = useServerFn(generateDm);
  const [busy, setBusy] = useState(false);
  const [primary, setPrimary] = useState<string>("");
  const [alt, setAlt] = useState<string>("");

  const stateFor = (s: Lead["stage"]): "NEW" | "CONTACTED" | "WAITING_RESPONSE" | "COOLING" | "STUCK" => {
    if (s === "TO_CONTACT") return "NEW";
    if (s === "CONTACTED") return "WAITING_RESPONSE";
    if (s === "REPLIED" || s === "CALL_BOOKED" || s === "NEGOTIATING") return "CONTACTED";
    return "STUCK";
  };

  const run = async () => {
    setBusy(true);
    setPrimary(""); setAlt("");
    try {
      const res = await gen({
        data: {
          handle: lead.handle,
          platform: lead.platform,
          followers: lead.followers ?? 0,
          niche: lead.niche ?? null,
          state: stateFor(lead.stage),
          goal: "reply",
        },
      });
      setPrimary(res.primary);
      setAlt(res.alternative);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Next best message
        </label>
        <Button size="sm" variant="ghost" onClick={run} disabled={busy}>
          <Sparkles className="size-4" /> {busy ? "Writing…" : primary ? "Regenerate" : "Suggest"}
        </Button>
      </div>
      {(primary || alt) && (
        <div className="space-y-2">
          {[
            { label: "Primary", text: primary },
            { label: "Alternative", text: alt },
          ].filter((x) => x.text).map((x) => (
            <button
              key={x.label}
              onClick={() => copy(x.text)}
              className="w-full text-left p-3 rounded-md bg-surface border border-border hover:bg-surface-hover transition"
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center justify-between">
                <span>{x.label}</span>
                <Copy className="size-3" />
              </div>
              <div className="text-sm">{x.text}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
