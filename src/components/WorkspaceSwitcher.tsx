import { useState } from "react";
import { ChevronsUpDown, Check, Plus, User, Users } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function WorkspaceSwitcher() {
  const { workspaces, current, setCurrentId, refresh } = useWorkspace();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("workspaces")
      .insert({ name: name.trim(), type: "team", owner_id: user.id })
      .select()
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Failed to create workspace");
      setSaving(false);
      return;
    }
    await supabase
      .from("workspace_members")
      .insert({ workspace_id: data.id, user_id: user.id, role: "owner" });
    await refresh();
    setCurrentId(data.id);
    setName("");
    setCreateOpen(false);
    setSaving(false);
    toast.success("Workspace created");
  };

  if (!current) return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg surface-panel hover:bg-surface-hover transition-colors text-left">
            <div className="size-8 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
              {current.type === "personal" ? <User className="size-4" /> : <Users className="size-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{current.name}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {current.type}
              </div>
            </div>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-1.5" align="start">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5">
            Workspaces
          </div>
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                setCurrentId(w.id);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-hover text-left text-sm"
            >
              <div className="size-7 rounded-md bg-secondary flex items-center justify-center">
                {w.type === "personal" ? <User className="size-3.5" /> : <Users className="size-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate">{w.name}</div>
                <div className="text-[10px] uppercase text-muted-foreground">{w.type}</div>
              </div>
              {w.id === current.id && <Check className="size-4 text-primary" />}
            </button>
          ))}
          <div className="border-t border-border my-1.5" />
          <button
            onClick={() => {
              setOpen(false);
              setCreateOpen(true);
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-hover text-left text-sm text-muted-foreground"
          >
            <div className="size-7 rounded-md bg-secondary flex items-center justify-center">
              <Plus className="size-3.5" />
            </div>
            New team workspace
          </button>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create team workspace</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!name.trim() || saving}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
