import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export type Workspace = {
  id: string;
  name: string;
  type: "personal" | "team";
  owner_id: string;
  allow_member_full_visibility: boolean;
  daily_target_contacts: number;
  daily_target_followups: number;
  invite_code: string | null;
};

type Ctx = {
  workspaces: Workspace[];
  currentId: string | null;
  current: Workspace | null;
  setCurrentId: (id: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
};

const WorkspaceCtx = createContext<Ctx>({
  workspaces: [],
  currentId: null,
  current: null,
  setCurrentId: () => {},
  refresh: async () => {},
  loading: true,
});

const STORAGE_KEY = "signflow:current_workspace";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentId, setCurrentIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) {
      setWorkspaces([]);
      setCurrentIdState(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("workspaces")
      .select("id,name,type,owner_id,allow_member_full_visibility,daily_target_contacts,daily_target_followups")
      .order("type", { ascending: true })
      .order("created_at", { ascending: true });
    const list = ((data ?? []) as Array<Omit<Workspace, "invite_code">>).map((w) => ({
      ...w,
      invite_code: null,
    })) as Workspace[];
    setWorkspaces(list);
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const valid = stored && list.find((w) => w.id === stored);
    const personal = list.find((w) => w.type === "personal");
    const next = valid ? stored : personal?.id ?? list[0]?.id ?? null;
    setCurrentIdState(next);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const setCurrentId = (id: string) => {
    setCurrentIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  };

  const current = workspaces.find((w) => w.id === currentId) ?? null;

  return (
    <WorkspaceCtx.Provider
      value={{ workspaces, currentId, current, setCurrentId, refresh: load, loading }}
    >
      {children}
    </WorkspaceCtx.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceCtx);
