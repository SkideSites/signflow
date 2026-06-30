
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;

ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS current_focus text,
  ADD COLUMN IF NOT EXISTS last_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_action_label text;

ALTER TABLE public.next_actions
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS label text;

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  code text;
  attempts int := 0;
BEGIN
  LOOP
    code := upper(translate(substr(gen_random_uuid()::text, 1, 8), '-', ''));
    code := substr(code, 1, 6);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.workspaces WHERE invite_code = code);
    attempts := attempts + 1;
    IF attempts > 8 THEN code := code || (floor(random()*100))::int::text; EXIT; END IF;
  END LOOP;
  RETURN code;
END; $$;

UPDATE public.workspaces SET invite_code = public.generate_invite_code()
  WHERE invite_code IS NULL;

CREATE OR REPLACE FUNCTION public.set_invite_code_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := public.generate_invite_code();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS workspaces_set_invite_code ON public.workspaces;
CREATE TRIGGER workspaces_set_invite_code
  BEFORE INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_invite_code_on_insert();

DROP POLICY IF EXISTS workspaces_all_authenticated ON public.workspaces;
DROP POLICY IF EXISTS members_all_authenticated ON public.workspace_members;

CREATE POLICY workspaces_select ON public.workspaces
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_workspace_member(id, auth.uid()));
CREATE POLICY workspaces_insert ON public.workspaces
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY workspaces_update_owner ON public.workspaces
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY workspaces_delete_owner_team ON public.workspaces
  FOR DELETE TO authenticated USING (owner_id = auth.uid() AND type = 'team');

CREATE POLICY members_select ON public.workspace_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY members_self_insert ON public.workspace_members
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY members_self_update ON public.workspace_members
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY members_delete ON public.workspace_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.workspaces w
               WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
  );

ALTER FUNCTION public.workspace_role_of(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.can_view_lead(uuid, uuid, uuid, uuid) SET search_path = public;
ALTER FUNCTION public.is_workspace_member(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.handle_new_lead() SET search_path = public;
ALTER FUNCTION public.touch_updated_at() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.workspace_role_of(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_lead(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_lead() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_invite_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_invite_code_on_insert() FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.next_actions TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
GRANT ALL ON public.workspace_members TO service_role;
GRANT ALL ON public.next_actions TO service_role;
