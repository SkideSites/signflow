import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { inviteMember, regenerateInviteCode } from "@/lib/workspace.functions";
import { toast } from "sonner";
import { Crown, User as UserIcon, Trash2, Copy, RefreshCw, Link as LinkIcon } from "lucide-react";

type Member = {
  user_id: string;
  role: "owner" | "admin" | "member";
  current_focus: string | null;
  last_action_at: string | null;
  last_action_label: string | null;
  profile: { email: string | null; display_name: string | null } | null;
};

export function ManageWorkspaceDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { current, refresh } = useWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  const invite = useServerFn(inviteMember);
  const regen = useServerFn(regenerateInviteCode);

  const { data: inviteCodeData } = useQuery({
    queryKey: ["ws-invite-code", current?.id],
    enabled: !!current && open,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_workspace_invite_code", {
        _workspace_id: current!.id,
      });
      return (data as string | null) ?? "";
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["ws-members", current?.id],
    enabled: !!current && open,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("workspace_members")
        .select("user_id, role, current_focus, last_action_at, last_action_label")
        .eq("workspace_id", current!.id);
      const list = (rows ?? []) as Omit<Member, "profile">[];
      const ids = list.map((r) => r.user_id);
      const map = new Map<string, { email: string | null; display_name: string | null }>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles").select("id, email, display_name").in("id", ids);
        (profs ?? []).forEach((p) => map.set(p.id, { email: p.email, display_name: p.display_name }));
      }
      return list.map((r) => ({ ...r, profile: map.get(r.user_id) ?? null })) as Member[];
    },
  });

  const myRole = members.find((m) => m.user_id === user?.id)?.role;
  const isOwner = myRole === "owner";

  const onInvite = async () => {
    if (!current || !email.trim()) return;
    setBusy(true);
    try {
      const res = await invite({ data: { workspaceId: current.id, email: email.trim() } });
      if (!res.ok) toast.error("No Signflow account found for that email yet.");
      else {
        toast.success("Member added");
        setEmail("");
        qc.invalidateQueries({ queryKey: ["ws-members", current.id] });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (uid: string) => {
    if (!current) return;
    await supabase.from("workspace_members").delete()
      .eq("workspace_id", current.id).eq("user_id", uid);
    qc.invalidateQueries({ queryKey: ["ws-members", current.id] });
  };

  const renameWs = async (name: string) => {
    if (!current || !isOwner) return;
    await supabase.from("workspaces").update({ name }).eq("id", current.id);
    await refresh();
  };

  const rotateCode = async () => {
    if (!current) return;
    try {
      await regen({ data: { workspaceId: current.id } });
      await refresh();
      toast.success("New invite code generated");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const copy = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  if (!current) return null;

  const code = inviteCodeData ?? "";
  const link = typeof window !== "undefined"
    ? `${window.location.origin}/?join=${code}`
    : `/?join=${code}`;

  // Active count for Team Pulse
  const activeCount = members.filter((m) => {
    if (!m.last_action_at) return false;
    return Date.now() - new Date(m.last_action_at).getTime() < 4 * 3600_000;
  }).length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage workspace</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {isOwner && (
              <div className="space-y-2">
                <Label className="text-xs">Workspace name</Label>
                <Input
                  defaultValue={current.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== current.name) renameWs(v);
                  }}
                />
              </div>
            )}

            {isOwner && code && (
              <div className="space-y-2">
                <Label className="text-xs">Invite code</Label>
                <div className="flex gap-2">
                  <div className="flex-1 surface-panel px-3 py-2 font-mono tracking-[0.3em] text-center text-base">
                    {code}
                  </div>
                  <Button variant="secondary" size="icon" onClick={() => copy(code)} aria-label="Copy code">
                    <Copy className="size-4" />
                  </Button>
                  <Button variant="secondary" size="icon" onClick={rotateCode} aria-label="Rotate code">
                    <RefreshCw className="size-4" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 surface-panel px-3 py-2 text-xs text-muted-foreground truncate">
                    {link}
                  </div>
                  <Button variant="secondary" size="icon" onClick={() => copy(link)} aria-label="Copy link">
                    <LinkIcon className="size-4" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Anyone with this code or link can join as a member.
                </p>
              </div>
            )}

            {isOwner && (
              <div className="space-y-2">
                <Label className="text-xs">Invite by email</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="teammate@email.com"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={onInvite} disabled={!email.trim() || busy}>Invite</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  They must already have a Signflow account.
                </p>
              </div>
            )}

            {/* Team pulse */}
            <div className="surface-panel p-3 text-xs flex items-center justify-between">
              <span className="text-muted-foreground">Team pulse</span>
              <span className="tabular-nums">
                {activeCount}/{members.length} active today
              </span>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Members · {members.length}</Label>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {members.map((m) => {
                  const status = memberStatus(m);
                  return (
                    <button
                      key={m.user_id}
                      onClick={() => setSelected(m)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md bg-surface hover:bg-surface-hover text-left transition"
                    >
                      <RoleIcon role={m.role} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">
                          {m.profile?.display_name || m.profile?.email || m.user_id.slice(0, 8)}
                          {m.user_id === user?.id && <span className="text-muted-foreground"> · you</span>}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {m.role === "owner" ? "Owner" : "Member"} · {status.label}
                        </div>
                      </div>
                      <span className={`size-2 rounded-full ${status.dot}`} />
                      {isOwner && m.role !== "owner" && m.user_id !== user?.id && (
                        <span
                          onClick={(e) => { e.stopPropagation(); removeMember(m.user_id); }}
                          className="text-muted-foreground hover:text-destructive p-1 cursor-pointer"
                          role="button"
                          aria-label="Remove"
                        >
                          <Trash2 className="size-4" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MemberPanel member={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function memberStatus(m: Member): { label: string; dot: string } {
  if (!m.last_action_at) return { label: "Offline", dot: "bg-muted-foreground/40" };
  const mins = (Date.now() - new Date(m.last_action_at).getTime()) / 60000;
  if (mins < 30) return { label: "Executing", dot: "bg-success" };
  if (mins < 240) return { label: "On track", dot: "bg-primary" };
  return { label: "Offline", dot: "bg-muted-foreground/40" };
}

function RoleIcon({ role }: { role: string }) {
  if (role === "owner") return <Crown className="size-4 text-primary" />;
  return <UserIcon className="size-4 text-muted-foreground" />;
}

function MemberPanel({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const { current } = useWorkspace();
  const today = new Date().toISOString().slice(0, 10);

  const { data: progress } = useQuery({
    queryKey: ["member-progress", member?.user_id, current?.id, today],
    enabled: !!member && !!current,
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_progress").select("*")
        .eq("workspace_id", current!.id)
        .eq("user_id", member!.user_id)
        .eq("date", today)
        .maybeSingle();
      return data;
    },
  });

  if (!member) return null;
  const status = memberStatus(member);
  const contacts = progress?.leads_contacted ?? 0;
  const followups = progress?.followups_completed ?? 0;
  const tContacts = current?.daily_target_contacts ?? 25;
  const tFollowups = current?.daily_target_followups ?? 10;
  const total = contacts + followups;
  const target = Math.max(1, tContacts + tFollowups);
  const score = Math.min(100, Math.round((total / target) * 100));

  const name = member.profile?.display_name || member.profile?.email || member.user_id.slice(0, 8);

  return (
    <Sheet open={!!member} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-sm bg-card border-border overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2.5">
            <div className="size-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-medium">
              {name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate">{name}</div>
              <div className="text-[11px] text-muted-foreground font-normal flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${status.dot}`} /> {status.label}
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="elevated-card p-4 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Execution score</div>
            <div className="text-4xl font-semibold tabular-nums">{score}<span className="text-base text-muted-foreground ml-0.5">/100</span></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="surface-panel p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Contacts</div>
              <div className="text-lg font-semibold tabular-nums">{contacts}<span className="text-xs text-muted-foreground">/{tContacts}</span></div>
            </div>
            <div className="surface-panel p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Follow-ups</div>
              <div className="text-lg font-semibold tabular-nums">{followups}<span className="text-xs text-muted-foreground">/{tFollowups}</span></div>
            </div>
          </div>

          <div className="surface-panel p-3 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current focus</div>
            <div className="text-sm">{member.current_focus ?? "—"}</div>
          </div>

          <div className="surface-panel p-3 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Last action</div>
            <div className="text-sm">{member.last_action_label ?? "No activity yet"}</div>
            {member.last_action_at && (
              <div className="text-[11px] text-muted-foreground">
                {new Date(member.last_action_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
