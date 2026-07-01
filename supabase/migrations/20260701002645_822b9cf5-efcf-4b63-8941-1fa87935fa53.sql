
REVOKE SELECT (invite_code) ON public.workspaces FROM authenticated;
REVOKE SELECT (invite_code) ON public.workspaces FROM anon;

GRANT SELECT (
  id, name, type, owner_id, created_at,
  allow_member_full_visibility, daily_target_contacts, daily_target_followups
) ON public.workspaces TO authenticated;

REVOKE ALL ON public.workspace_members FROM anon;
REVOKE ALL ON public.workspaces FROM anon;
