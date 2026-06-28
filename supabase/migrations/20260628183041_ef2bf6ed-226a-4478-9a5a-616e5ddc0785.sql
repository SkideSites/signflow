
-- Simplify workspace + workspace_members RLS for MVP stability (per user request)
DROP POLICY IF EXISTS workspaces_select_members ON public.workspaces;
DROP POLICY IF EXISTS workspaces_insert_self_owner ON public.workspaces;
DROP POLICY IF EXISTS workspaces_update_owner_admin ON public.workspaces;
DROP POLICY IF EXISTS workspaces_delete_owner_nonpersonal ON public.workspaces;

CREATE POLICY workspaces_all_authenticated ON public.workspaces
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS members_select_visible ON public.workspace_members;
DROP POLICY IF EXISTS members_insert_owner_admin ON public.workspace_members;
DROP POLICY IF EXISTS members_update_owner_admin ON public.workspace_members;
DROP POLICY IF EXISTS members_delete_owner_admin_or_self ON public.workspace_members;

CREATE POLICY members_all_authenticated ON public.workspace_members
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tighten profiles SELECT so users only see profiles of people sharing a workspace, or themselves
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;

CREATE POLICY profiles_select_shared_workspace ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm1
      JOIN public.workspace_members wm2 ON wm1.workspace_id = wm2.workspace_id
      WHERE wm1.user_id = auth.uid() AND wm2.user_id = profiles.id
    )
  );
