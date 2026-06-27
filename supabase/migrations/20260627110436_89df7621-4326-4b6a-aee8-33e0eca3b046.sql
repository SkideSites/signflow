
-- ENUMS
CREATE TYPE public.workspace_type AS ENUM ('personal', 'team');
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.lead_stage AS ENUM ('TO_CONTACT','CONTACTED','REPLIED','CALL_BOOKED','NEGOTIATING','SIGNED','LOST');
CREATE TYPE public.lead_platform AS ENUM ('instagram','tiktok','twitter','youtube','onlyfans','other');
CREATE TYPE public.action_type AS ENUM ('send_first_message','re_engage','reply','call_prep','call_completed','follow_up');
CREATE TYPE public.activity_type AS ENUM ('lead_created','message_sent','reply_received','follow_up_sent','re_engaged','call_booked','call_completed','stage_changed','note_added','assigned','lost','signed');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- WORKSPACES
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type public.workspace_type NOT NULL DEFAULT 'team',
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allow_member_full_visibility BOOLEAN NOT NULL DEFAULT false,
  daily_target_contacts INT NOT NULL DEFAULT 18,
  daily_target_followups INT NOT NULL DEFAULT 11,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- WORKSPACE MEMBERS
CREATE TABLE public.workspace_members (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Security definer helpers (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.workspace_role_of(_workspace_id UUID, _user_id UUID)
RETURNS public.workspace_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id;
$$;

CREATE POLICY "workspaces_select_members" ON public.workspaces FOR SELECT TO authenticated
  USING (public.is_workspace_member(id, auth.uid()));
CREATE POLICY "workspaces_insert_self_owner" ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "workspaces_update_owner_admin" ON public.workspaces FOR UPDATE TO authenticated
  USING (public.workspace_role_of(id, auth.uid()) IN ('owner','admin'));
CREATE POLICY "workspaces_delete_owner_nonpersonal" ON public.workspaces FOR DELETE TO authenticated
  USING (owner_id = auth.uid() AND type <> 'personal');

CREATE POLICY "members_select_visible" ON public.workspace_members FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "members_insert_owner_admin" ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','admin') OR user_id = auth.uid());
CREATE POLICY "members_update_owner_admin" ON public.workspace_members FOR UPDATE TO authenticated
  USING (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','admin'));
CREATE POLICY "members_delete_owner_admin_or_self" ON public.workspace_members FOR DELETE TO authenticated
  USING (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','admin') OR user_id = auth.uid());

-- LEADS
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  handle TEXT NOT NULL,
  platform public.lead_platform NOT NULL DEFAULT 'instagram',
  followers INT NOT NULL DEFAULT 0,
  niche TEXT,
  stage public.lead_stage NOT NULL DEFAULT 'TO_CONTACT',
  notes TEXT,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_contact_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX leads_workspace_idx ON public.leads(workspace_id);
CREATE INDEX leads_stage_idx ON public.leads(workspace_id, stage);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_lead(_workspace_id UUID, _assignee UUID, _created_by UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE
      WHEN NOT public.is_workspace_member(_workspace_id, _user_id) THEN false
      WHEN public.workspace_role_of(_workspace_id, _user_id) IN ('owner','admin') THEN true
      WHEN (SELECT allow_member_full_visibility FROM public.workspaces WHERE id = _workspace_id) THEN true
      WHEN _assignee = _user_id OR _created_by = _user_id THEN true
      ELSE false
    END;
$$;

CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated
  USING (public.can_view_lead(workspace_id, assignee_id, created_by, auth.uid()));
CREATE POLICY "leads_insert" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated
  USING (public.can_view_lead(workspace_id, assignee_id, created_by, auth.uid()));
CREATE POLICY "leads_delete" ON public.leads FOR DELETE TO authenticated
  USING (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','admin'));

-- LEAD COLLABORATORS
CREATE TABLE public.lead_collaborators (
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (lead_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.lead_collaborators TO authenticated;
GRANT ALL ON public.lead_collaborators TO service_role;
ALTER TABLE public.lead_collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_collab_select" ON public.lead_collaborators FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND public.is_workspace_member(l.workspace_id, auth.uid())));
CREATE POLICY "lead_collab_write" ON public.lead_collaborators FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND public.is_workspace_member(l.workspace_id, auth.uid())));
CREATE POLICY "lead_collab_delete" ON public.lead_collaborators FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND public.is_workspace_member(l.workspace_id, auth.uid())));

-- NEXT ACTIONS
CREATE TABLE public.next_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type public.action_type NOT NULL,
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  priority INT NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX next_actions_workspace_due_idx ON public.next_actions(workspace_id, completed_at, due_at);
CREATE UNIQUE INDEX next_actions_one_open_per_lead ON public.next_actions(lead_id) WHERE completed_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.next_actions TO authenticated;
GRANT ALL ON public.next_actions TO service_role;
ALTER TABLE public.next_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "actions_select" ON public.next_actions FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "actions_insert" ON public.next_actions FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "actions_update" ON public.next_actions FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "actions_delete" ON public.next_actions FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ACTIVITIES
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type public.activity_type NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activities_lead_idx ON public.activities(lead_id, created_at DESC);
CREATE INDEX activities_workspace_idx ON public.activities(workspace_id, created_at DESC);
GRANT SELECT, INSERT ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activities_select" ON public.activities FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "activities_insert" ON public.activities FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- DAILY PROGRESS
CREATE TABLE public.daily_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  leads_contacted INT NOT NULL DEFAULT 0,
  followups_completed INT NOT NULL DEFAULT 0,
  streak INT NOT NULL DEFAULT 0,
  UNIQUE(workspace_id, user_id, date)
);
GRANT SELECT, INSERT, UPDATE ON public.daily_progress TO authenticated;
GRANT ALL ON public.daily_progress TO service_role;
ALTER TABLE public.daily_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progress_select" ON public.daily_progress FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "progress_upsert_self" ON public.daily_progress FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "progress_update_self" ON public.daily_progress FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ON SIGNUP: create profile + personal workspace
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_ws_id UUID;
  display TEXT;
BEGIN
  display := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1));
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (NEW.id, NEW.email, display, NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspaces (name, type, owner_id)
  VALUES ('Personal', 'personal', NEW.id)
  RETURNING id INTO new_ws_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_ws_id, NEW.id, 'owner');

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- After lead insert: auto-create first action + activity
CREATE OR REPLACE FUNCTION public.handle_new_lead()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.next_actions (workspace_id, lead_id, user_id, type, due_at, priority)
  VALUES (NEW.workspace_id, NEW.id, NEW.assignee_id, 'send_first_message', now(), 40);
  INSERT INTO public.activities (workspace_id, lead_id, user_id, type)
  VALUES (NEW.workspace_id, NEW.id, NEW.created_by, 'lead_created');
  RETURN NEW;
END; $$;
CREATE TRIGGER leads_after_insert AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.handle_new_lead();
