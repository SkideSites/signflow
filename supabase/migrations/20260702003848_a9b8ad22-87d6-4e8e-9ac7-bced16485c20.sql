
-- Lock down SECURITY DEFINER functions: revoke public/anon EXECUTE everywhere.
-- Trigger-only functions do not need EXECUTE for API roles at all.
-- RLS helper + client-callable helpers keep authenticated EXECUTE only.

-- Trigger-only functions: remove all API-role EXECUTE
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_lead() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_invite_code_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_workspace_member_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_invite_code() FROM PUBLIC, anon, authenticated;

-- RLS helper functions: only authenticated needs EXECUTE (called inside policies)
REVOKE ALL ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.workspace_role_of(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_role_of(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_view_lead(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_lead(uuid, uuid, uuid, uuid) TO authenticated;

-- Owner-only invite code accessor
REVOKE ALL ON FUNCTION public.get_workspace_invite_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_invite_code(uuid) TO authenticated;
