import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type NextAction = Database["public"]["Tables"]["next_actions"]["Row"];
export type Activity = Database["public"]["Tables"]["activities"]["Row"];
export type Stage = Database["public"]["Enums"]["lead_stage"];
export type ActionType = Database["public"]["Enums"]["action_type"];

const FOLLOW_UP_DAYS = 3;

export async function logActivity(
  workspace_id: string,
  lead_id: string,
  user_id: string,
  type: Database["public"]["Enums"]["activity_type"],
  meta: Record<string, unknown> = {},
) {
  await supabase.from("activities").insert({ workspace_id, lead_id, user_id, type, meta: meta as never });
}

const ACTION_PRETTY: Record<string, string> = {
  send_first_message: "Sent first message",
  follow_up: "Sent follow-up",
  re_engage: "Re-engaged lead",
  reply: "Replied to message",
  call_prep: "Prepared call",
  call_completed: "Completed call",
};

/** Complete current action and schedule next one based on lead stage + behavior. */
export async function completeAction(opts: {
  action: NextAction;
  lead: Lead;
  user_id: string;
  newStage?: Stage;
  bumpContact?: boolean;
  scheduleFollowUp?: boolean;
  method?: string;
}) {
  const { action, lead, user_id, newStage, bumpContact = true, scheduleFollowUp = true, method } = opts;
  const now = new Date().toISOString();

  await supabase.from("next_actions").update({ completed_at: now }).eq("id", action.id);

  const updates: Partial<Lead> = {};
  if (newStage) updates.stage = newStage;
  if (bumpContact) updates.last_contact_at = now;
  if (scheduleFollowUp && bumpContact) {
    const fu = new Date(Date.now() + FOLLOW_UP_DAYS * 86400_000).toISOString();
    updates.next_follow_up_at = fu;
  }
  if (Object.keys(updates).length > 0) {
    await supabase.from("leads").update(updates).eq("id", lead.id);
  }

  let activityType: Database["public"]["Enums"]["activity_type"] = "message_sent";
  let nextActionType: ActionType | null = "follow_up";
  let nextDue = updates.next_follow_up_at ?? null;

  switch (action.type) {
    case "send_first_message": activityType = "message_sent"; break;
    case "re_engage": activityType = "re_engaged"; break;
    case "reply": activityType = "message_sent"; break;
    case "call_prep":
      activityType = "call_booked";
      nextActionType = "call_completed";
      nextDue = now;
      break;
    case "call_completed":
      activityType = "call_completed";
      nextActionType = null;
      break;
    case "follow_up": activityType = "follow_up_sent"; break;
  }

  await logActivity(lead.workspace_id, lead.id, user_id, activityType, { method });

  if (nextActionType && nextDue) {
    await supabase.from("next_actions").insert({
      workspace_id: lead.workspace_id,
      lead_id: lead.id,
      user_id,
      type: nextActionType,
      due_at: nextDue,
      priority: nextActionType === "follow_up" ? 60 : 30,
    });
  }

  await bumpDailyProgress(lead.workspace_id, user_id, action.type);

  // Update member "last action" focus + label so team panel reflects activity
  await supabase
    .from("workspace_members")
    .update({
      last_action_at: now,
      last_action_label: ACTION_PRETTY[action.type] ?? action.type,
      current_focus: `@${lead.handle}`,
    })
    .eq("workspace_id", lead.workspace_id)
    .eq("user_id", user_id);
}

export async function markReplied(lead: Lead, user_id: string) {
  await supabase.from("leads").update({ stage: "REPLIED" }).eq("id", lead.id);
  await supabase.from("next_actions")
    .update({ completed_at: new Date().toISOString() })
    .eq("lead_id", lead.id).is("completed_at", null);
  await supabase.from("next_actions").insert({
    workspace_id: lead.workspace_id, lead_id: lead.id, user_id,
    type: "reply", due_at: new Date().toISOString(), priority: 20,
  });
  await logActivity(lead.workspace_id, lead.id, user_id, "reply_received");
}

export async function changeStage(lead: Lead, newStage: Stage, user_id: string) {
  if (lead.stage === newStage) return;
  await supabase.from("leads").update({ stage: newStage }).eq("id", lead.id);
  await logActivity(lead.workspace_id, lead.id, user_id, "stage_changed", { from: lead.stage, to: newStage });
  if (newStage === "SIGNED" || newStage === "LOST") {
    await supabase.from("next_actions")
      .update({ completed_at: new Date().toISOString() })
      .eq("lead_id", lead.id).is("completed_at", null);
    await logActivity(lead.workspace_id, lead.id, user_id, newStage === "SIGNED" ? "signed" : "lost");
  } else if (newStage === "CALL_BOOKED") {
    await supabase.from("next_actions")
      .update({ completed_at: new Date().toISOString() })
      .eq("lead_id", lead.id).is("completed_at", null);
    await supabase.from("next_actions").insert({
      workspace_id: lead.workspace_id, lead_id: lead.id, user_id,
      type: "call_prep", due_at: new Date().toISOString(), priority: 10,
    });
  }
}

async function bumpDailyProgress(workspace_id: string, user_id: string, actionType: ActionType) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("daily_progress").select("*")
    .eq("workspace_id", workspace_id).eq("user_id", user_id).eq("date", today)
    .maybeSingle();

  const isContact = actionType === "send_first_message" || actionType === "re_engage" || actionType === "reply";
  const isFollowup = actionType === "follow_up";

  if (!existing) {
    await supabase.from("daily_progress").insert({
      workspace_id, user_id, date: today,
      leads_contacted: isContact ? 1 : 0,
      followups_completed: isFollowup ? 1 : 0,
    });
  } else {
    await supabase.from("daily_progress").update({
      leads_contacted: existing.leads_contacted + (isContact ? 1 : 0),
      followups_completed: existing.followups_completed + (isFollowup ? 1 : 0),
    }).eq("id", existing.id);
  }
}
