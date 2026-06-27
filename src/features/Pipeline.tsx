import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { STAGES, STAGE_LABELS, formatFollowers, isOverdue, timeAgo } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { LeadDrawer } from "./LeadDrawer";
import { changeStage } from "@/lib/leadActions";
import type { Lead, Stage } from "@/lib/leadActions";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function Pipeline() {
  const { current } = useWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  // Optimistic overlay: lead id -> stage
  const [optimistic, setOptimistic] = useState<Record<string, Stage>>({});

  const { data: leads = [] } = useQuery({
    queryKey: ["pipeline-leads", current?.id],
    enabled: !!current,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("workspace_id", current!.id)
        .order("updated_at", { ascending: false });
      return (data ?? []) as Lead[];
    },
  });

  const grouped = useMemo(() => {
    const g: Record<Stage, Lead[]> = {
      TO_CONTACT: [], CONTACTED: [], REPLIED: [], CALL_BOOKED: [], NEGOTIATING: [], SIGNED: [], LOST: [],
    };
    for (const l of leads) {
      const stage = (optimistic[l.id] ?? l.stage) as Stage;
      g[stage].push(l);
    }
    return g;
  }, [leads, optimistic]);

  const onDrop = async (target: Stage) => {
    const id = dragId;
    setDragId(null);
    setDragOver(null);
    if (!id) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    const currentStage = optimistic[id] ?? lead.stage;
    if (currentStage === target) return;
    setOptimistic((o) => ({ ...o, [id]: target }));
    try {
      await changeStage(lead, target, user!.id);
      await qc.invalidateQueries({ queryKey: ["pipeline-leads", current?.id] });
      // Wait for query to settle then clear optimistic
      setOptimistic((o) => { const n = { ...o }; delete n[id]; return n; });
    } catch (e) {
      setOptimistic((o) => { const n = { ...o }; delete n[id]; return n; });
      toast.error("Failed to move lead");
    }
  };

  return (
    <div className="px-4 md:px-8 py-6 md:py-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">{leads.length} leads · drag between stages</p>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none">
        {STAGES.map((stage) => {
          const items = grouped[stage];
          const isOver = dragOver === stage;
          return (
            <div
              key={stage}
              onDragOver={(e) => { e.preventDefault(); setDragOver(stage); }}
              onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
              onDrop={() => onDrop(stage)}
              className={`shrink-0 w-72 snap-start surface-panel p-3 flex flex-col gap-2 max-h-[calc(100vh-180px)] transition-colors ${
                isOver ? "bg-surface-hover ring-2 ring-primary/40" : ""
              }`}
            >
              <div className="flex items-center justify-between px-1 pb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {STAGE_LABELS[stage]}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{items.length}</span>
              </div>
              <div className="space-y-2 overflow-y-auto pr-1 flex-1">
                {items.map((lead) => (
                  <article
                    key={lead.id}
                    draggable
                    onDragStart={() => setDragId(lead.id)}
                    onDragEnd={() => { setDragId(null); setDragOver(null); }}
                    onClick={() => setOpenLead(lead.id)}
                    className={`bg-elevated border border-border rounded-md p-2.5 cursor-grab active:cursor-grabbing hover:border-primary/40 transition-colors ${
                      dragId === lead.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">@{lead.handle}</span>
                      {lead.next_follow_up_at && isOverdue(lead.next_follow_up_at) && (
                        <AlertTriangle className="size-3.5 text-warning shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Badge variant="outline" className="text-[9px] uppercase px-1.5 py-0">{lead.platform}</Badge>
                      <span className="text-[10px] text-muted-foreground">{formatFollowers(lead.followers)}</span>
                      {lead.niche && <span className="text-[10px] text-muted-foreground truncate">· {lead.niche}</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1.5">
                      {lead.last_contact_at ? `Contact ${timeAgo(lead.last_contact_at)}` : "Never contacted"}
                    </div>
                  </article>
                ))}
                {items.length === 0 && (
                  <div className="text-[11px] text-muted-foreground/60 text-center py-6">Empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <LeadDrawer leadId={openLead} onClose={() => setOpenLead(null)} />
    </div>
  );
}
