
-- 1. Replace overly-permissive members_self_update with a role-locked policy.
DROP POLICY IF EXISTS "members_self_update" ON public.workspace_members;

-- Trigger prevents a non-owner from changing role (or workspace_id/user_id).
CREATE OR REPLACE FUNCTION public.enforce_workspace_member_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_owner boolean;
BEGIN
  SELECT (owner_id = auth.uid()) INTO is_owner
    FROM public.workspaces WHERE id = NEW.workspace_id;

  IF NEW.workspace_id <> OLD.workspace_id OR NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Cannot change workspace or user of a membership';
  END IF;

  IF NEW.role <> OLD.role AND NOT COALESCE(is_owner, false) THEN
    RAISE EXCEPTION 'Only the workspace owner can change member roles';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_workspace_member_update ON public.workspace_members;
CREATE TRIGGER trg_enforce_workspace_member_update
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_workspace_member_update();

-- Members can update their own row (focus/last_action). Owners can update any member in workspaces they own.
CREATE POLICY "members_update_self_or_owner"
  ON public.workspace_members
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
  );

-- 2. Hide invite_code from non-owners via a SECURITY DEFINER helper + view.
-- Simpler: expose a helper function that returns the code only to owners; frontend uses it.
CREATE OR REPLACE FUNCTION public.get_workspace_invite_code(_workspace_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT invite_code FROM public.workspaces
  WHERE id = _workspace_id AND owner_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_workspace_invite_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_invite_code(uuid) TO authenticated;

-- 3. Tighten lead_collab_write with can_view_lead.
DROP POLICY IF EXISTS "lead_collab_write" ON public.lead_collaborators;
CREATE POLICY "lead_collab_write"
  ON public.lead_collaborators
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_collaborators.lead_id
        AND public.can_view_lead(l.workspace_id, l.assignee_id, l.created_by, auth.uid())
    )
  );

-- 4. Lock down SECURITY DEFINER helpers to authenticated role only.
REVOKE ALL ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.workspace_role_of(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_role_of(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.can_view_lead(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_lead(uuid, uuid, uuid, uuid) TO authenticated;
