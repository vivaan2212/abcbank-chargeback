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
      chargeback_actions: {
        Row: {
          action_type: string
          admin_message: string
          awaiting_merchant_refund: boolean
          awaiting_settlement: boolean
          chargeback_case_id: string | null
          chargeback_filed: boolean
          created_at: string
          customer_id: string
          days_since_settlement: number | null
          days_since_transaction: number
          dispute_id: string
          id: string
          internal_notes: string | null
          is_chip: boolean
          is_contactless: boolean
          is_facebook_meta: boolean
          is_magstripe: boolean
          is_restricted_mcc: boolean
          is_secured_otp: boolean
          is_unsecured: boolean
          merchant_category_code: number
          net_amount: number
          requires_manual_review: boolean
          temporary_credit_issued: boolean
          transaction_id: string
          updated_at: string
          video_id: string | null
        }
        Insert: {
          action_type: string
          admin_message: string
          awaiting_merchant_refund?: boolean
          awaiting_settlement?: boolean
          chargeback_case_id?: string | null
          chargeback_filed?: boolean
          created_at?: string
          customer_id: string
          days_since_settlement?: number | null
          days_since_transaction: number
          dispute_id: string
          id?: string
          internal_notes?: string | null
          is_chip: boolean
          is_contactless: boolean
          is_facebook_meta?: boolean
          is_magstripe: boolean
          is_restricted_mcc?: boolean
          is_secured_otp: boolean
          is_unsecured: boolean
          merchant_category_code: number
          net_amount: number
          requires_manual_review?: boolean
          temporary_credit_issued?: boolean
          transaction_id: string
          updated_at?: string
          video_id?: string | null
        }
        Update: {
          action_type?: string
          admin_message?: string
          awaiting_merchant_refund?: boolean
          awaiting_settlement?: boolean
          chargeback_case_id?: string | null
          chargeback_filed?: boolean
          created_at?: string
          customer_id?: string
          days_since_settlement?: number | null
          days_since_transaction?: number
          dispute_id?: string
          id?: string
          internal_notes?: string | null
          is_chip?: boolean
          is_contactless?: boolean
          is_facebook_meta?: boolean
          is_magstripe?: boolean
          is_restricted_mcc?: boolean
          is_secured_otp?: boolean
          is_unsecured?: boolean
          merchant_category_code?: number
          net_amount?: number
          requires_manual_review?: boolean
          temporary_credit_issued?: boolean
          transaction_id?: string
          updated_at?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chargeback_actions_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeback_actions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeback_actions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "chargeback_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      chargeback_knowledge_base: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          keywords: string[]
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          id?: string
          keywords?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          keywords?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      chargeback_representment_static: {
        Row: {
          created_at: string
          id: string
          merchant_document_url: string | null
          merchant_reason_text: string | null
          representment_status: Database["public"]["Enums"]["representment_status_enum"]
          source: string | null
          transaction_id: string
          updated_at: string
          will_be_represented: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_document_url?: string | null
          merchant_reason_text?: string | null
          representment_status?: Database["public"]["Enums"]["representment_status_enum"]
          source?: string | null
          transaction_id: string
          updated_at?: string
          will_be_represented?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          merchant_document_url?: string | null
          merchant_reason_text?: string | null
          representment_status?: Database["public"]["Enums"]["representment_status_enum"]
          source?: string | null
          transaction_id?: string
          updated_at?: string
          will_be_represented?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fk_transaction"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      chargeback_videos: {
        Row: {
          card_network: string
          duration_seconds: number
          file_size_mb: number
          id: string
          is_active: boolean
          uploaded_at: string
          video_path: string
        }
        Insert: {
          card_network: string
          duration_seconds: number
          file_size_mb: number
          id?: string
          is_active?: boolean
          uploaded_at?: string
          video_path: string
        }
        Update: {
          card_network?: string
          duration_seconds?: number
          file_size_mb?: number
          id?: string
          is_active?: boolean
          uploaded_at?: string
          video_path?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          status: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      customer_evidence_reviews: {
        Row: {
          created_at: string
          customer_evidence_id: string
          id: string
          review_decision: string
          review_notes: string | null
          reviewed_at: string
          reviewed_by: string
          transaction_id: string
        }
        Insert: {
          created_at?: string
          customer_evidence_id: string
          id?: string
          review_decision: string
          review_notes?: string | null
          reviewed_at?: string
          reviewed_by: string
          transaction_id: string
        }
        Update: {
          created_at?: string
          customer_evidence_id?: string
          id?: string
          review_decision?: string
          review_notes?: string | null
          reviewed_at?: string
          reviewed_by?: string
          transaction_id?: string
        }
        Relationships: []
      }
      delete_operations: {
        Row: {
          conversation_id: string
          created_at: string
          deleted_at: string
          id: string
          idempotency_key: string
          result: Json
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          deleted_at?: string
          id?: string
          idempotency_key: string
          result?: Json
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          deleted_at?: string
          id?: string
          idempotency_key?: string
          result?: Json
          user_id?: string
        }
        Relationships: []
      }
      dispute_action_log: {
        Row: {
          action: string
          created_at: string
          id: string
          network: string | null
          note: string | null
          performed_at: string
          performed_by: string | null
          transaction_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          network?: string | null
          note?: string | null
          performed_at?: string
          performed_by?: string | null
          transaction_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          network?: string | null
          note?: string | null
          performed_at?: string
          performed_by?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_action_log_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_customer_evidence: {
        Row: {
          ai_reasons: Json | null
          ai_sufficient: boolean | null
          ai_summary: string | null
          created_at: string
          customer_id: string
          customer_note: string | null
          evidence_type: string
          evidence_url: string | null
          id: string
          transaction_id: string
        }
        Insert: {
          ai_reasons?: Json | null
          ai_sufficient?: boolean | null
          ai_summary?: string | null
          created_at?: string
          customer_id: string
          customer_note?: string | null
          evidence_type: string
          evidence_url?: string | null
          id?: string
          transaction_id: string
        }
        Update: {
          ai_reasons?: Json | null
          ai_sufficient?: boolean | null
          ai_summary?: string | null
          created_at?: string
          customer_id?: string
          customer_note?: string | null
          evidence_type?: string
          evidence_url?: string | null
          id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_customer_evidence_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_customer_evidence_request: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          note: string | null
          requested_at: string
          status: string
          transaction_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          note?: string | null
          requested_at?: string
          status?: string
          transaction_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          note?: string | null
          requested_at?: string
          status?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_customer_evidence_request_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_decisions: {
        Row: {
          audit: Json
          base_amount_usd: number | null
          created_at: string
          customer_id: string
          decision: string
          dispute_id: string
          evaluated_at: string
          flags: Json
          id: string
          inputs_hash: string
          next_actions: Json
          policy_code: string
          reason_summary: string
          remaining_amount_usd: number | null
          transaction_id: string
        }
        Insert: {
          audit: Json
          base_amount_usd?: number | null
          created_at?: string
          customer_id: string
          decision: string
          dispute_id: string
          evaluated_at?: string
          flags?: Json
          id?: string
          inputs_hash: string
          next_actions?: Json
          policy_code: string
          reason_summary: string
          remaining_amount_usd?: number | null
          transaction_id: string
        }
        Update: {
          audit?: Json
          base_amount_usd?: number | null
          created_at?: string
          customer_id?: string
          decision?: string
          dispute_id?: string
          evaluated_at?: string
          flags?: Json
          id?: string
          inputs_hash?: string
          next_actions?: Json
          policy_code?: string
          reason_summary?: string
          remaining_amount_usd?: number | null
          transaction_id?: string
        }
        Relationships: []
      }
      disputes: {
        Row: {
          conversation_id: string | null
          created_at: string
          custom_reason: string | null
          customer_id: string
          documents: Json | null
          eligibility_reasons: string[] | null
          eligibility_status: string | null
          id: string
          order_details: string | null
          reason_id: string | null
          reason_label: string | null
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          custom_reason?: string | null
          customer_id: string
          documents?: Json | null
          eligibility_reasons?: string[] | null
          eligibility_status?: string | null
          id?: string
          order_details?: string | null
          reason_id?: string | null
          reason_label?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          custom_reason?: string | null
          customer_id?: string
          documents?: Json | null
          eligibility_reasons?: string[] | null
          eligibility_status?: string | null
          id?: string
          order_details?: string | null
          reason_id?: string | null
          reason_label?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      representment_audit_log: {
        Row: {
          action: string
          admin_notes: string | null
          id: string
          merchant_document_url: string | null
          performed_at: string
          performed_by: string | null
          transaction_id: string
        }
        Insert: {
          action: string
          admin_notes?: string | null
          id?: string
          merchant_document_url?: string | null
          performed_at?: string
          performed_by?: string | null
          transaction_id: string
        }
        Update: {
          action?: string
          admin_notes?: string | null
          id?: string
          merchant_document_url?: string | null
          performed_at?: string
          performed_by?: string | null
          transaction_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          acquirer_name: string
          chargeback_case_id: string | null
          created_at: string | null
          customer_id: string
          dispute_status: string | null
          id: string
          is_wallet_transaction: boolean
          local_transaction_amount: number
          local_transaction_currency: string
          merchant_category_code: number
          merchant_id: number
          merchant_name: string
          needs_attention: boolean | null
          pos_entry_mode: number
          refund_amount: number
          refund_received: boolean
          secured_indication: number
          settled: boolean
          settlement_date: string | null
          temporary_credit_amount: number | null
          temporary_credit_currency: string | null
          temporary_credit_provided: boolean | null
          temporary_credit_reversal_at: string | null
          transaction_amount: number
          transaction_currency: string
          transaction_id: number
          transaction_time: string
          wallet_type: string | null
        }
        Insert: {
          acquirer_name: string
          chargeback_case_id?: string | null
          created_at?: string | null
          customer_id: string
          dispute_status?: string | null
          id?: string
          is_wallet_transaction?: boolean
          local_transaction_amount: number
          local_transaction_currency: string
          merchant_category_code: number
          merchant_id: number
          merchant_name: string
          needs_attention?: boolean | null
          pos_entry_mode: number
          refund_amount?: number
          refund_received?: boolean
          secured_indication: number
          settled?: boolean
          settlement_date?: string | null
          temporary_credit_amount?: number | null
          temporary_credit_currency?: string | null
          temporary_credit_provided?: boolean | null
          temporary_credit_reversal_at?: string | null
          transaction_amount: number
          transaction_currency: string
          transaction_id: number
          transaction_time: string
          wallet_type?: string | null
        }
        Update: {
          acquirer_name?: string
          chargeback_case_id?: string | null
          created_at?: string | null
          customer_id?: string
          dispute_status?: string | null
          id?: string
          is_wallet_transaction?: boolean
          local_transaction_amount?: number
          local_transaction_currency?: string
          merchant_category_code?: number
          merchant_id?: number
          merchant_name?: string
          needs_attention?: boolean | null
          pos_entry_mode?: number
          refund_amount?: number
          refund_received?: boolean
          secured_indication?: number
          settled?: boolean
          settlement_date?: string | null
          temporary_credit_amount?: number | null
          temporary_credit_currency?: string | null
          temporary_credit_provided?: boolean | null
          temporary_credit_reversal_at?: string | null
          transaction_amount?: number
          transaction_currency?: string
          transaction_id?: number
          transaction_time?: string
          wallet_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      purge_old_delete_operations: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "customer" | "bank_admin"
      representment_status_enum:
        | "no_representment"
        | "pending"
        | "accepted_by_bank"
        | "awaiting_customer_info"
        | "rejected_by_bank"
        | "customer_evidence_approved"
        | "customer_evidence_rejected"
        | "rebuttal_submitted"
        | "rebuttal_accepted"
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
      app_role: ["customer", "bank_admin"],
      representment_status_enum: [
        "no_representment",
        "pending",
        "accepted_by_bank",
        "awaiting_customer_info",
        "rejected_by_bank",
        "customer_evidence_approved",
        "customer_evidence_rejected",
        "rebuttal_submitted",
        "rebuttal_accepted",
      ],
    },
  },
} as const
