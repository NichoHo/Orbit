export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      tasks: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          priority: Database['public']['Enums']['task_priority']
          tags: string[]
          estimated_min: number | null
          due_date: string | null
          completed_at: string | null
          parent_id: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
          fts: unknown | null
        }
        Insert: Partial<Database['public']['Tables']['tasks']['Row']>
        Update: Partial<Database['public']['Tables']['tasks']['Row']>
        Relationships: [
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          }
        ]
      }
      habits: {
        Row: {
          id: string
          user_id: string
          title: string
          cadence: Database['public']['Enums']['habit_cadence']
          target_per_period: number
          color: string
          archived_at: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['habits']['Row']>
        Update: Partial<Database['public']['Tables']['habits']['Row']>
        Relationships: [
          {
            foreignKeyName: "habits_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      habit_entries: {
        Row: {
          id: string
          habit_id: string
          user_id: string
          entry_date: string
          count: number
          note: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['habit_entries']['Row']>
        Update: Partial<Database['public']['Tables']['habit_entries']['Row']>
        Relationships: [
          {
            foreignKeyName: "habit_entries_habit_id_user_id_fkey"
            columns: ["habit_id", "user_id"]
            referencedRelation: "habits"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "habit_entries_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
          id: string
          full_name: string | null
          avatar_url: string | null
          timezone: string
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['profiles']['Row']>
        Update: Partial<Database['public']['Tables']['profiles']['Row']>
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      daily_summaries: {
        Row: {
          id: string
          user_id: string
          summary_date: string
          user_note: string | null
          ai_summary: string | null
          ai_model: string | null
          generated_at: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['daily_summaries']['Row']>
        Update: Partial<Database['public']['Tables']['daily_summaries']['Row']>
        Relationships: [
          {
            foreignKeyName: "daily_summaries_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      ai_usage: {
        Row: {
          user_id: string
          usage_date: string
          calls: number
        }
        Insert: Database['public']['Tables']['ai_usage']['Row']
        Update: Partial<Database['public']['Tables']['ai_usage']['Row']>
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      habit_streaks: {
        Row: {
          habit_id: string
          user_id: string
          current_streak: number
        }
        Relationships: []
      }
    }
    Functions: {}
    Enums: {
      task_priority: 'low' | 'medium' | 'high' | 'urgent'
      habit_cadence: 'daily' | 'weekly'
    }
  }
}

export const Constants = {
  public: {
    Enums: {
      task_priority: ["low", "medium", "high", "urgent"] as const,
      habit_cadence: ["daily", "weekly"] as const,
    }
  }
} as const;
