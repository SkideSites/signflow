import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { inviteMember } from "@/lib/workspace.functions";
import { toast } from "sonner";
import { Crown, Shield, User as UserIcon, Trash2 } from "lucide-react";

export function ManageWorkspaceDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { current, refresh } = useWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const invite = useServerFn(inviteMember);

  const { data: members = [] } = useQuery({
    queryKey: ["ws-members", current?.id],
    enabled: !!current && open,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("workspace_members")
        .select("user_id, role, created_at")
        .eq("workspace_id", current!.id);
      const list = (rows ?? []) as Array<{ user_id: string; role: "owner" | "admin" | "member"; created_at: string }>;
      const ids = list.map((r) => r.user_id);
      const profilesById = new Map<string, { email: string | null; display_name: string | null }>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles").select("id, email, display_name").in("id", ids);
        (profs ?? []).forEach((p) => profilesById.set(p.id, { email: p.email, display_name: p.display_name }));
      }
      return list.map((r) => ({ ...r, profile: profilesById.get(r.user_id) ?? null }));
    },
  });

  const myRole = members.find((m) => m.user_id === user?.id)?.role;
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  const onInvite = async () => {
    if (!current || !email.trim()) return;
    setBusy(true);
    try {
      const res = await invite({ data: { workspaceId: current.id, email: email.trim(), role } });
      if (!res.ok) {
        toast.error("No Signflow account found for that email yet.");
      } else {
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

  if (!current) return null;

  return (
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

          {canManage && (
            <div className="space-y-2">
              <Label className="text-xs">Invite member</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="teammate@email.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1"
                />
                <Select value={role} onValueChange={(v) => setRole(v as "member" | "admin")}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={onInvite} disabled={!email.trim() || busy}>Invite</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                They must already have a Signflow account.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Members · {members.length}</Label>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-surface">
                  <RoleIcon role={m.role} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">
                      {m.profile?.display_name || m.profile?.email || m.user_id.slice(0, 8)}
                      {m.user_id === user?.id && <span className="text-muted-foreground"> · you</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{m.role}</div>
                  </div>
                  {canManage && m.role !== "owner" && m.user_id !== user?.id && (
                    <button
                      className="text-muted-foreground hover:text-destructive p-1"
                      onClick={() => removeMember(m.user_id)}
                      aria-label="Remove"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoleIcon({ role }: { role: string }) {
  if (role === "owner") return <Crown className="size-4 text-primary" />;
  if (role === "admin") return <Shield className="size-4 text-warning" />;
  return <UserIcon className="size-4 text-muted-foreground" />;
}
