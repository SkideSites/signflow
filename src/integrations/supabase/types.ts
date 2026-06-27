export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string
          id: string
          lead_id: string | null
          meta: Json
          type: Database["public"]["Enums"]["activity_type"]
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id?: string | null
          meta?: Json
          type: Database["public"]["Enums"]["activity_type"]
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string | null
          meta?: Json
          type?: Database["public"]["Enums"]["activity_type"]
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_progress: {
        Row: {
          date: string
          followups_completed: number
          id: string
          leads_contacted: number
          streak: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          date?: string
          followups_completed?: number
          id?: string
          leads_contacted?: number
          streak?: number
          user_id: string
          workspace_id: string
        }
        Update: {
          date?: string
          followups_completed?: number
          id?: string
          leads_contacted?: number
          streak?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_progress_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_collaborators: {
        Row: {
          lead_id: string
          user_id: string
        }
        Insert: {
          lead_id: string
          user_id: string
        }
        Update: {
          lead_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_collaborators_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by: string
          followers: number
          handle: string
          id: string
          last_contact_at: string | null
          next_follow_up_at: string | null
          niche: string | null
          notes: string | null
          platform: Database["public"]["Enums"]["lead_platform"]
          stage: Database["public"]["Enums"]["lead_stage"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by: string
          followers?: number
          handle: string
          id?: string
          last_contact_at?: string | null
          next_follow_up_at?: string | null
          niche?: string | null
          notes?: string | null
          platform?: Database["public"]["Enums"]["lead_platform"]
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string
          followers?: number
          handle?: string
          id?: string
          last_contact_at?: string | null
          next_follow_up_at?: string | null
          niche?: string | null
          notes?: string | null
          platform?: Database["public"]["Enums"]["lead_platform"]
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      next_actions: {
        Row: {
          completed_at: string | null
          created_at: string
          due_at: string
          id: string
          lead_id: string
          priority: number
          type: Database["public"]["Enums"]["action_type"]
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_at?: string
          id?: string
          lead_id: string
          priority?: number
          type: Database["public"]["Enums"]["action_type"]
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_at?: string
          id?: string
          lead_id?: string
          priority?: number
          type?: Database["public"]["Enums"]["action_type"]
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "next_actions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_actions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          allow_member_full_visibility: boolean
          created_at: string
          daily_target_contacts: number
          daily_target_followups: number
          id: string
          name: string
          owner_id: string
          type: Database["public"]["Enums"]["workspace_type"]
        }
        Insert: {
          allow_member_full_visibility?: boolean
          created_at?: string
          daily_target_contacts?: number
          daily_target_followups?: number
          id?: string
          name: string
          owner_id: string
          type?: Database["public"]["Enums"]["workspace_type"]
        }
        Update: {
          allow_member_full_visibility?: boolean
          created_at?: string
          daily_target_contacts?: number
          daily_target_followups?: number
          id?: string
          name?: string
          owner_id?: string
          type?: Database["public"]["Enums"]["workspace_type"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_lead: {
        Args: {
          _assignee: string
          _created_by: string
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      workspace_role_of: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      action_type:
        | "send_first_message"
        | "re_engage"
        | "reply"
        | "call_prep"
        | "call_completed"
        | "follow_up"
      activity_type:
        | "lead_created"
        | "message_sent"
        | "reply_received"
        | "follow_up_sent"
        | "re_engaged"
        | "call_booked"
        | "call_completed"
        | "stage_changed"
        | "note_added"
        | "assigned"
        | "lost"
        | "signed"
      lead_platform:
        | "instagram"
        | "tiktok"
        | "twitter"
        | "youtube"
        | "onlyfans"
        | "other"
      lead_stage:
        | "TO_CONTACT"
        | "CONTACTED"
        | "REPLIED"
        | "CALL_BOOKED"
        | "NEGOTIATING"
        | "SIGNED"
        | "LOST"
      workspace_role: "owner" | "admin" | "member"
      workspace_type: "personal" | "team"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      action_type: [
        "send_first_message",
        "re_engage",
        "reply",
        "call_prep",
        "call_completed",
        "follow_up",
      ],
      activity_type: [
        "lead_created",
        "message_sent",
        "reply_received",
        "follow_up_sent",
        "re_engaged",
        "call_booked",
        "call_completed",
        "stage_changed",
        "note_added",
        "assigned",
        "lost",
        "signed",
      ],
      lead_platform: [
        "instagram",
        "tiktok",
        "twitter",
        "youtube",
        "onlyfans",
        "other",
      ],
      lead_stage: [
        "TO_CONTACT",
        "CONTACTED",
        "REPLIED",
        "CALL_BOOKED",
        "NEGOTIATING",
        "SIGNED",
        "LOST",
      ],
      workspace_role: ["owner", "admin", "member"],
      workspace_type: ["personal", "team"],
    },
  },
} as const
