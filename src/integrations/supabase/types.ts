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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      battle_states: {
        Row: {
          created_at: string
          current_turn_user_id: string | null
          dungeon_id: string
          id: string
          party_id: string | null
          state: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_turn_user_id?: string | null
          dungeon_id: string
          id?: string
          party_id?: string | null
          state?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_turn_user_id?: string | null
          dungeon_id?: string
          id?: string
          party_id?: string | null
          state?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_states_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      duels: {
        Row: {
          a_name: string
          a_user: string
          b_name: string
          b_user: string
          created_at: string
          id: string
          room_id: string
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          a_name: string
          a_user: string
          b_name: string
          b_user: string
          created_at?: string
          id?: string
          room_id: string
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          a_name?: string
          a_user?: string
          b_name?: string
          b_user?: string
          created_at?: string
          id?: string
          room_id?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          created_at: string
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: []
      }
      parties: {
        Row: {
          created_at: string
          id: string
          leader_id: string
          room_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          leader_id: string
          room_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          leader_id?: string
          room_id?: string | null
        }
        Relationships: []
      }
      party_invites: {
        Row: {
          created_at: string
          expires_at: string
          from_name: string
          from_user: string
          id: string
          party_id: string | null
          room_id: string | null
          to_user: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          from_name: string
          from_user: string
          id?: string
          party_id?: string | null
          room_id?: string | null
          to_user: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          from_name?: string
          from_user?: string
          id?: string
          party_id?: string | null
          room_id?: string | null
          to_user?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_invites_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      party_members: {
        Row: {
          figure: string
          joined_at: string
          name: string
          party_id: string
          user_id: string
        }
        Insert: {
          figure?: string
          joined_at?: string
          name: string
          party_id: string
          user_id: string
        }
        Update: {
          figure?: string
          joined_at?: string
          name?: string
          party_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_members_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          class_id: string | null
          fishing_level: number
          gardening_level: number
          habbo_figure: string | null
          habbo_motto: string | null
          habbo_profile_json: Json | null
          habbo_unique_id: string | null
          habbo_username: string | null
          habbo_verified_at: string | null
          id: string
          last_habbo_skill_sync: string | null
          unlocked_skills: Json
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          fishing_level?: number
          gardening_level?: number
          habbo_figure?: string | null
          habbo_motto?: string | null
          habbo_profile_json?: Json | null
          habbo_unique_id?: string | null
          habbo_username?: string | null
          habbo_verified_at?: string | null
          id: string
          last_habbo_skill_sync?: string | null
          unlocked_skills?: Json
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          fishing_level?: number
          gardening_level?: number
          habbo_figure?: string | null
          habbo_motto?: string | null
          habbo_profile_json?: Json | null
          habbo_unique_id?: string | null
          habbo_username?: string | null
          habbo_verified_at?: string | null
          id?: string
          last_habbo_skill_sync?: string | null
          unlocked_skills?: Json
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action: string
          last_at: string
          user_id: string
        }
        Insert: {
          action: string
          last_at?: string
          user_id: string
        }
        Update: {
          action?: string
          last_at?: string
          user_id?: string
        }
        Relationships: []
      }
      room_layouts: {
        Row: {
          id: string
          layout: Json
          room_id: string
          updated_at: string
          version: number
        }
        Insert: {
          id?: string
          layout?: Json
          room_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          id?: string
          layout?: Json
          room_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      room_messages: {
        Row: {
          created_at: string
          id: string
          mode: string
          name: string
          room_id: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string
          name: string
          room_id: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          name?: string
          room_id?: string
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      room_presence: {
        Row: {
          dir: number
          figure: string
          last_seen: string
          name: string
          room_id: string
          user_id: string
          x: number
          y: number
        }
        Insert: {
          dir?: number
          figure?: string
          last_seen?: string
          name: string
          room_id: string
          user_id: string
          x?: number
          y?: number
        }
        Update: {
          dir?: number
          figure?: string
          last_seen?: string
          name?: string
          room_id?: string
          user_id?: string
          x?: number
          y?: number
        }
        Relationships: []
      }
      stash_gold: {
        Row: {
          gold: number
          user_id: string
        }
        Insert: {
          gold?: number
          user_id: string
        }
        Update: {
          gold?: number
          user_id?: string
        }
        Relationships: []
      }
      trade_offers: {
        Row: {
          created_at: string
          id: string
          inventory_id: string
          item_id: string
          trade_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_id: string
          item_id: string
          trade_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_id?: string
          item_id?: string
          trade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_offers_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_offers_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          a_accepted: boolean
          a_confirmed: boolean
          a_name: string
          a_user: string
          b_accepted: boolean
          b_confirmed: boolean
          b_name: string
          b_user: string
          created_at: string
          id: string
          room_id: string | null
          stage: string
          status: string
          updated_at: string
        }
        Insert: {
          a_accepted?: boolean
          a_confirmed?: boolean
          a_name: string
          a_user: string
          b_accepted?: boolean
          b_confirmed?: boolean
          b_name: string
          b_user: string
          created_at?: string
          id?: string
          room_id?: string | null
          stage?: string
          status?: string
          updated_at?: string
        }
        Update: {
          a_accepted?: boolean
          a_confirmed?: boolean
          a_name?: string
          a_user?: string
          b_accepted?: boolean
          b_confirmed?: boolean
          b_name?: string
          b_user?: string
          created_at?: string
          id?: string
          room_id?: string | null
          stage?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      execute_trade: { Args: { _trade_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      in_party: {
        Args: { _party_id: string; _user_id: string }
        Returns: boolean
      }
      rate_limit_touch: {
        Args: { _action: string; _min_interval: string; _user_id: string }
        Returns: boolean
      }
      reap_stale_presence: { Args: { _ttl?: string }; Returns: number }
      sync_verified_habbo_admin_role: {
        Args: { _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
