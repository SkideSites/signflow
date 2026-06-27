import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export function AddLead() {
  const { current } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState<"instagram" | "tiktok" | "twitter" | "youtube" | "onlyfans" | "other">("instagram");
  const [followers, setFollowers] = useState("");
  const [niche, setNiche] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      if (!current || !user) throw new Error("No workspace");
      const clean = handle.trim().replace(/^@/, "");
      if (!clean) throw new Error("Handle required");
      const { data, error } = await supabase
        .from("leads")
        .insert({
          workspace_id: current.id,
          handle: clean,
          platform,
          followers: Number(followers) || 0,
          niche: niche.trim() || null,
          created_by: user.id,
          assignee_id: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Lead added");
      navigate({ to: "/pipeline" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Add lead</h1>
      <p className="text-sm text-muted-foreground mb-6">Drops into <b>To Contact</b>. First action will be <b>Send first message</b>.</p>

      <form
        onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
        className="elevated-card p-5 space-y-4"
      >
        <div className="space-y-1.5">
          <Label>Handle</Label>
          <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@username" autoFocus />
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
            <Input inputMode="numeric" value={followers} onChange={(e) => setFollowers(e.target.value.replace(/[^0-9]/g, ""))} placeholder="50000" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Niche</Label>
          <Input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="fitness, lifestyle…" />
        </div>
        <Button type="submit" className="w-full" disabled={m.isPending}>
          {m.isPending ? "Adding…" : "Add lead"}
        </Button>
      </form>
    </div>
  );
}
