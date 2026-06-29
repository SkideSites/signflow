import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Invite an existing user to a workspace by email.
 * Looks up the profile via admin client (bypasses RLS on profiles), then inserts
 * the membership using the caller's authed client so RLS still validates them.
 */
export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      workspaceId: z.string().uuid(),
      email: z.string().email(),
      role: z.enum(["admin", "member"]).default("member"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Caller must be owner/admin of the workspace
    const { data: caller } = await context.supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!caller || (caller.role !== "owner" && caller.role !== "admin")) {
      throw new Response("Not allowed", { status: 403 });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name")
      .ilike("email", data.email)
      .maybeSingle();

    if (!profile) {
      return { ok: false as const, reason: "not_found" as const };
    }

    const { error } = await supabaseAdmin
      .from("workspace_members")
      .upsert(
        { workspace_id: data.workspaceId, user_id: profile.id, role: data.role },
        { onConflict: "workspace_id,user_id" },
      );
    if (error) throw new Response(error.message, { status: 400 });

    return { ok: true as const, member: { id: profile.id, email: profile.email, display_name: profile.display_name } };
  });
