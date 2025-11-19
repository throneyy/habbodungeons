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
          battle_log: Json | null
          created_at: string
          current_enemy_state: Json
          current_room_index: number
          current_story_node: Json | null
          current_turn_user_id: string | null
          dead_players: Json | null
          dungeon_id: string
          id: string
          is_active: boolean
          party_id: string | null
          server_id: string | null
          turn_order: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          battle_log?: Json | null
          created_at?: string
          current_enemy_state: Json
          current_room_index?: number
          current_story_node?: Json | null
          current_turn_user_id?: string | null
          dead_players?: Json | null
          dungeon_id: string
          id?: string
          is_active?: boolean
          party_id?: string | null
          server_id?: string | null
          turn_order?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          battle_log?: Json | null
          created_at?: string
          current_enemy_state?: Json
          current_room_index?: number
          current_story_node?: Json | null
          current_turn_user_id?: string | null
          dead_players?: Json | null
          dungeon_id?: string
          id?: string
          is_active?: boolean
          party_id?: string | null
          server_id?: string | null
          turn_order?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_states_dungeon_id_fkey"
            columns: ["dungeon_id"]
            isOneToOne: false
            referencedRelation: "dungeons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_states_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_states_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      dungeons: {
        Row: {
          created_at: string
          difficulty: string
          dungeon_json: Json
          id: string
          name: string
          owner_user_id: string
          theme: string
        }
        Insert: {
          created_at?: string
          difficulty: string
          dungeon_json: Json
          id?: string
          name: string
          owner_user_id: string
          theme: string
        }
        Update: {
          created_at?: string
          difficulty?: string
          dungeon_json?: Json
          id?: string
          name?: string
          owner_user_id?: string
          theme?: string
        }
        Relationships: []
      }
      enemy_sprites: {
        Row: {
          created_at: string | null
          enemy_name: string
          id: string
          sprite_filename: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          enemy_name: string
          id?: string
          sprite_filename: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          enemy_name?: string
          id?: string
          sprite_filename?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          created_at: string
          id: string
          is_equipped: boolean | null
          item_name: string
          item_type: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_equipped?: boolean | null
          item_name: string
          item_type: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_equipped?: boolean | null
          item_name?: string
          item_type?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      parties: {
        Row: {
          created_at: string
          dungeon_id: string | null
          id: string
          invite_code: string
          leader_id: string
          max_members: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          dungeon_id?: string | null
          id?: string
          invite_code: string
          leader_id: string
          max_members?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          dungeon_id?: string | null
          id?: string
          invite_code?: string
          leader_id?: string
          max_members?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parties_dungeon_id_fkey"
            columns: ["dungeon_id"]
            isOneToOne: false
            referencedRelation: "dungeons"
            referencedColumns: ["id"]
          },
        ]
      }
      party_members: {
        Row: {
          id: string
          joined_at: string
          party_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          party_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
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
      player_stats: {
        Row: {
          atk: number
          created_at: string
          current_hp: number
          current_mp: number
          current_xp: number
          def: number
          equipped_weapon_id: string | null
          id: string
          level: number
          max_hp: number
          max_mp: number
          spd: number
          status_effects: Json | null
          updated_at: string
          user_id: string
          xp_to_next_level: number
        }
        Insert: {
          atk?: number
          created_at?: string
          current_hp?: number
          current_mp?: number
          current_xp?: number
          def?: number
          equipped_weapon_id?: string | null
          id?: string
          level?: number
          max_hp?: number
          max_mp?: number
          spd?: number
          status_effects?: Json | null
          updated_at?: string
          user_id: string
          xp_to_next_level?: number
        }
        Update: {
          atk?: number
          created_at?: string
          current_hp?: number
          current_mp?: number
          current_xp?: number
          def?: number
          equipped_weapon_id?: string | null
          id?: string
          level?: number
          max_hp?: number
          max_mp?: number
          spd?: number
          status_effects?: Json | null
          updated_at?: string
          user_id?: string
          xp_to_next_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_stats_equipped_weapon_id_fkey"
            columns: ["equipped_weapon_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          habbo_profile_json: Json | null
          habbo_username: string | null
          id: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          habbo_profile_json?: Json | null
          habbo_username?: string | null
          id: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          habbo_profile_json?: Json | null
          habbo_username?: string | null
          id?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      server_players: {
        Row: {
          id: string
          joined_at: string
          server_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          server_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          server_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_players_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      servers: {
        Row: {
          created_at: string
          difficulty: string
          dungeon_id: string | null
          host_user_id: string
          id: string
          is_active: boolean
          max_players: number
          server_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          difficulty?: string
          dungeon_id?: string | null
          host_user_id: string
          id?: string
          is_active?: boolean
          max_players?: number
          server_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          difficulty?: string
          dungeon_id?: string | null
          host_user_id?: string
          id?: string
          is_active?: boolean
          max_players?: number
          server_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "servers_dungeon_id_fkey"
            columns: ["dungeon_id"]
            isOneToOne: false
            referencedRelation: "dungeons"
            referencedColumns: ["id"]
          },
        ]
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
      can_view_party_members: {
        Args: { _party_id: string; _user_id: string }
        Returns: boolean
      }
      generate_invite_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_party_leader: {
        Args: { _party_id: string; _user_id: string }
        Returns: boolean
      }
      is_party_member: {
        Args: { _party_id: string; _user_id: string }
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
