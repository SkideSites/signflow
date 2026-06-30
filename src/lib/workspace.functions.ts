import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Join a workspace via 6-char invite code. Self-inserts membership. */
export const joinWorkspaceByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(4).max(16) }).parse(d))
  .handler(async ({ data, context }) => {
    const code = data.code.trim().toUpperCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("id, name, type")
      .eq("invite_code", code)
      .maybeSingle();
    if (!ws) return { ok: false as const, reason: "not_found" as const };

    const { error } = await supabaseAdmin
      .from("workspace_members")
      .upsert(
        { workspace_id: ws.id, user_id: context.userId, role: "member" },
        { onConflict: "workspace_id,user_id" },
      );
    if (error) throw new Response(error.message, { status: 400 });

    return { ok: true as const, workspaceId: ws.id, name: ws.name };
  });

/** Owner-only: invite by email if the user already exists. */
export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      workspaceId: z.string().uuid(),
      email: z.string().email(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: caller } = await context.supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!caller || caller.role !== "owner") {
      throw new Response("Only the owner can invite", { status: 403 });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name")
      .ilike("email", data.email)
      .maybeSingle();
    if (!profile) return { ok: false as const, reason: "not_found" as const };

    const { error } = await supabaseAdmin
      .from("workspace_members")
      .upsert(
        { workspace_id: data.workspaceId, user_id: profile.id, role: "member" },
        { onConflict: "workspace_id,user_id" },
      );
    if (error) throw new Response(error.message, { status: 400 });

    return {
      ok: true as const,
      member: { id: profile.id, email: profile.email, display_name: profile.display_name },
    };
  });

/** Owner-only: rotate invite code. */
export const regenerateInviteCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ws } = await context.supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (!ws || ws.owner_id !== context.userId) {
      throw new Response("Only the owner can rotate the code", { status: 403 });
    }
    const code =
      Math.random().toString(36).slice(2, 8).toUpperCase() +
      Math.floor(Math.random() * 10).toString();
    const { error } = await supabaseAdmin
      .from("workspaces")
      .update({ invite_code: code.slice(0, 6) })
      .eq("id", data.workspaceId);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true as const, code: code.slice(0, 6) };
  });
