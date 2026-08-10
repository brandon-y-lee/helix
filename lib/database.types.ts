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
      admin_memberships: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
          variant_key: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          updated_at?: string
          variant_key: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          variant_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          checkout_generation: string
          created_at: string
          currency: string
          expires_at: string | null
          guest_token_hash: string | null
          id: string
          status: Database["public"]["Enums"]["cart_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          checkout_generation?: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          guest_token_hash?: string | null
          id?: string
          status?: Database["public"]["Enums"]["cart_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          checkout_generation?: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          guest_token_hash?: string | null
          id?: string
          status?: Database["public"]["Enums"]["cart_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      catalog_editor_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          draft_id: string | null
          id: string
          metadata: Json
          product_id: string | null
          revision_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          draft_id?: string | null
          id?: string
          metadata?: Json
          product_id?: string | null
          revision_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          draft_id?: string | null
          id?: string
          metadata?: Json
          product_id?: string | null
          revision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_editor_audit_log_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "product_content_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_editor_audit_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_editor_audit_log_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "catalog_product_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_revisions: {
        Row: {
          document: Json
          id: string
          product_id: string
          published_at: string
          published_by: string | null
          revision_number: number
          schema_version: number
          source_draft_id: string | null
        }
        Insert: {
          document: Json
          id?: string
          product_id: string
          published_at?: string
          published_by?: string | null
          revision_number: number
          schema_version?: number
          source_draft_id?: string | null
        }
        Update: {
          document?: Json
          id?: string
          product_id?: string
          published_at?: string
          published_by?: string | null
          revision_number?: number
          schema_version?: number
          source_draft_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_revisions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_product_revisions_source_draft_id_fkey"
            columns: ["source_draft_id"]
            isOneToOne: false
            referencedRelation: "product_content_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_accounts: {
        Row: {
          created_at: string
          lifetime_points: number
          points_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          lifetime_points?: number
          points_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          lifetime_points?: number
          points_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loyalty_ledger_entries: {
        Row: {
          created_at: string
          description: string
          entry_type: Database["public"]["Enums"]["loyalty_ledger_entry_type"]
          id: string
          metadata: Json
          order_id: string | null
          points: number
          source_key: string
          status: Database["public"]["Enums"]["loyalty_ledger_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          entry_type: Database["public"]["Enums"]["loyalty_ledger_entry_type"]
          id?: string
          metadata?: Json
          order_id?: string | null
          points: number
          source_key: string
          status?: Database["public"]["Enums"]["loyalty_ledger_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          entry_type?: Database["public"]["Enums"]["loyalty_ledger_entry_type"]
          id?: string
          metadata?: Json
          order_id?: string | null
          points?: number
          source_key?: string
          status?: Database["public"]["Enums"]["loyalty_ledger_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_redemptions: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          order_id: string | null
          points: number
          source_key: string
          status: Database["public"]["Enums"]["loyalty_redemption_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          order_id?: string | null
          points: number
          source_key: string
          status?: Database["public"]["Enums"]["loyalty_redemption_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          order_id?: string | null
          points?: number
          source_key?: string
          status?: Database["public"]["Enums"]["loyalty_redemption_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_subtotal_cents: number
          order_id: string
          product_id: string | null
          product_name: string
          product_slug: string
          product_snapshot: Json
          quantity: number
          unit_price_cents: number
          variant_key: string
          variant_label: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_subtotal_cents: number
          order_id: string
          product_id?: string | null
          product_name: string
          product_slug: string
          product_snapshot?: Json
          quantity: number
          unit_price_cents: number
          variant_key: string
          variant_label: string
        }
        Update: {
          created_at?: string
          id?: string
          line_subtotal_cents?: number
          order_id?: string
          product_id?: string | null
          product_name?: string
          product_slug?: string
          product_snapshot?: Json
          quantity?: number
          unit_price_cents?: number
          variant_key?: string
          variant_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_address: Json
          cancelled_at: string | null
          cart_id: string | null
          checkout_attempt_started_at: string | null
          checkout_attempt_token: string | null
          checkout_environment: Database["public"]["Enums"]["checkout_environment"]
          checkout_generation: string | null
          created_at: string
          currency: string
          customer_email: string | null
          discount_cents: number
          id: string
          idempotency_key: string
          merchandise_subtotal_cents: number
          metadata: Json
          order_number: string
          paid_at: string | null
          referral_code: string | null
          refunded_at: string | null
          reward_discount_cents: number
          reward_points_earned: number
          reward_points_redeemed: number
          shipping_address: Json
          shipping_cents: number
          shipping_name: string | null
          status: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          tax_cents: number
          total_cents: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          billing_address?: Json
          cancelled_at?: string | null
          cart_id?: string | null
          checkout_attempt_started_at?: string | null
          checkout_attempt_token?: string | null
          checkout_environment?: Database["public"]["Enums"]["checkout_environment"]
          checkout_generation?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          discount_cents?: number
          id?: string
          idempotency_key: string
          merchandise_subtotal_cents: number
          metadata?: Json
          order_number: string
          paid_at?: string | null
          referral_code?: string | null
          refunded_at?: string | null
          reward_discount_cents?: number
          reward_points_earned?: number
          reward_points_redeemed?: number
          shipping_address?: Json
          shipping_cents?: number
          shipping_name?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          tax_cents?: number
          total_cents: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          billing_address?: Json
          cancelled_at?: string | null
          cart_id?: string | null
          checkout_attempt_started_at?: string | null
          checkout_attempt_token?: string | null
          checkout_environment?: Database["public"]["Enums"]["checkout_environment"]
          checkout_generation?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          discount_cents?: number
          id?: string
          idempotency_key?: string
          merchandise_subtotal_cents?: number
          metadata?: Json
          order_number?: string
          paid_at?: string | null
          referral_code?: string | null
          refunded_at?: string | null
          reward_discount_cents?: number
          reward_points_earned?: number
          reward_points_redeemed?: number
          shipping_address?: Json
          shipping_cents?: number
          shipping_name?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount_cents: number
          checkout_environment: Database["public"]["Enums"]["checkout_environment"]
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          last_error: string | null
          metadata: Json
          order_id: string
          provider: string
          raw_status: string | null
          status: Database["public"]["Enums"]["payment_attempt_status"]
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          checkout_environment?: Database["public"]["Enums"]["checkout_environment"]
          created_at?: string
          currency?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          metadata?: Json
          order_id: string
          provider?: string
          raw_status?: string | null
          status?: Database["public"]["Enums"]["payment_attempt_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          checkout_environment?: Database["public"]["Enums"]["checkout_environment"]
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          metadata?: Json
          order_id?: string
          provider?: string
          raw_status?: string | null
          status?: Database["public"]["Enums"]["payment_attempt_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      private_feedback: {
        Row: {
          comments: string | null
          created_at: string
          id: string
          order_id: string
          points_awarded: number
          rating: number | null
          status: Database["public"]["Enums"]["private_feedback_status"]
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          id?: string
          order_id: string
          points_awarded?: number
          rating?: number | null
          status?: Database["public"]["Enums"]["private_feedback_status"]
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          id?: string
          order_id?: string
          points_awarded?: number
          rating?: number | null
          status?: Database["public"]["Enums"]["private_feedback_status"]
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_content_drafts: {
        Row: {
          base_revision: number
          created_at: string
          created_by: string
          discarded_at: string | null
          document: Json
          id: string
          product_id: string
          published_at: string | null
          ready_at: string | null
          schema_version: number
          status: string
          updated_at: string
          updated_by: string
          validation_errors: Json
          version: number
        }
        Insert: {
          base_revision?: number
          created_at?: string
          created_by: string
          discarded_at?: string | null
          document: Json
          id?: string
          product_id: string
          published_at?: string | null
          ready_at?: string | null
          schema_version?: number
          status?: string
          updated_at?: string
          updated_by: string
          validation_errors?: Json
          version?: number
        }
        Update: {
          base_revision?: number
          created_at?: string
          created_by?: string
          discarded_at?: string | null
          document?: Json
          id?: string
          product_id?: string
          published_at?: string | null
          ready_at?: string | null
          schema_version?: number
          status?: string
          updated_at?: string
          updated_by?: string
          validation_errors?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_content_drafts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt: string
          archived_at: string | null
          created_at: string
          height: number | null
          id: string
          media_type: string
          original_source_url: string | null
          palette_id: string | null
          placeholder_palette: Json
          product_id: string
          role: string
          sort_order: number
          source_filename: string | null
          updated_at: string
          url: string | null
          variant_id: string | null
          width: number | null
        }
        Insert: {
          alt: string
          archived_at?: string | null
          created_at?: string
          height?: number | null
          id?: string
          media_type?: string
          original_source_url?: string | null
          palette_id?: string | null
          placeholder_palette?: Json
          product_id: string
          role?: string
          sort_order?: number
          source_filename?: string | null
          updated_at?: string
          url?: string | null
          variant_id?: string | null
          width?: number | null
        }
        Update: {
          alt?: string
          archived_at?: string | null
          created_at?: string
          height?: number | null
          id?: string
          media_type?: string
          original_source_url?: string | null
          palette_id?: string | null
          placeholder_palette?: Json
          product_id?: string
          role?: string
          sort_order?: number
          source_filename?: string | null
          updated_at?: string
          url?: string | null
          variant_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_pdp_content: {
        Row: {
          application_steps: string[] | null
          created_at: string
          how_to_use_steps: string[] | null
          ingredient_cards: Json | null
          ingredient_story: Json | null
          outcome_heading: string | null
          outcome_labels: string[] | null
          product_id: string
          profile_title_tokens: Json | null
          routine_guidance: string | null
          routine_overlay: string | null
          schema_version: number
          updated_at: string
        }
        Insert: {
          application_steps?: string[] | null
          created_at?: string
          how_to_use_steps?: string[] | null
          ingredient_cards?: Json | null
          ingredient_story?: Json | null
          outcome_heading?: string | null
          outcome_labels?: string[] | null
          product_id: string
          profile_title_tokens?: Json | null
          routine_guidance?: string | null
          routine_overlay?: string | null
          schema_version?: number
          updated_at?: string
        }
        Update: {
          application_steps?: string[] | null
          created_at?: string
          how_to_use_steps?: string[] | null
          ingredient_cards?: Json | null
          ingredient_story?: Json | null
          outcome_heading?: string | null
          outcome_labels?: string[] | null
          product_id?: string
          profile_title_tokens?: Json | null
          routine_guidance?: string | null
          routine_overlay?: string | null
          schema_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_pdp_content_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_relationships: {
        Row: {
          archived_at: string | null
          created_at: string
          product_id: string
          related_product_id: string
          relationship_type: string
          sort_order: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          product_id: string
          related_product_id: string
          relationship_type?: string
          sort_order?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          product_id?: string
          related_product_id?: string
          relationship_type?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_relationships_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relationships_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_slug_routes: {
        Row: {
          created_at: string
          route_kind: string
          source_product_id: string
          source_slug: string
          target_product_id: string
        }
        Insert: {
          created_at?: string
          route_kind: string
          source_product_id: string
          source_slug: string
          target_product_id: string
        }
        Update: {
          created_at?: string
          route_kind?: string
          source_product_id?: string
          source_slug?: string
          target_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_slug_routes_source_product_id_fkey"
            columns: ["source_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_slug_routes_target_product_id_fkey"
            columns: ["target_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sources: {
        Row: {
          created_at: string
          formulation_version_notes: string | null
          original_source_price_cents: number | null
          product_id: string
          raw_source: Json
          source_content_hash: string | null
          source_inspected_at: string
          supplier: string
          supplier_handle: string
          supplier_product_id: string | null
          supplier_title: string
          supplier_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          formulation_version_notes?: string | null
          original_source_price_cents?: number | null
          product_id: string
          raw_source?: Json
          source_content_hash?: string | null
          source_inspected_at: string
          supplier: string
          supplier_handle: string
          supplier_product_id?: string | null
          supplier_title: string
          supplier_url: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          formulation_version_notes?: string | null
          original_source_price_cents?: number | null
          product_id?: string
          raw_source?: Json
          source_content_hash?: string | null
          source_inspected_at?: string
          supplier?: string
          supplier_handle?: string
          supplier_product_id?: string | null
          supplier_title?: string
          supplier_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_sources_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          archived_at: string | null
          available: boolean
          compare_at_price_cents: number | null
          id: string
          inventory_status: string
          label: string
          option_values: Json
          pack_count: number | null
          price_cents: number
          product_id: string
          sku: string | null
          sort_order: number
          supplier_variant_id: string | null
          updated_at: string
          variant_key: string
          volume: string | null
        }
        Insert: {
          archived_at?: string | null
          available?: boolean
          compare_at_price_cents?: number | null
          id?: string
          inventory_status?: string
          label: string
          option_values?: Json
          pack_count?: number | null
          price_cents: number
          product_id: string
          sku?: string | null
          sort_order: number
          supplier_variant_id?: string | null
          updated_at?: string
          variant_key: string
          volume?: string | null
        }
        Update: {
          archived_at?: string | null
          available?: boolean
          compare_at_price_cents?: number | null
          id?: string
          inventory_status?: string
          label?: string
          option_values?: Json
          pack_count?: number | null
          price_cents?: number
          product_id?: string
          sku?: string | null
          sort_order?: number
          supplier_variant_id?: string | null
          updated_at?: string
          variant_key?: string
          volume?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          badge: string | null
          benefits: string[]
          catalog_status: string
          cautions: string[]
          concerns: string[]
          created_at: string
          currency: string
          display_name: string
          editorial_description: string
          editorial_how_to_use: string
          finish: string | null
          formula_notes: string[]
          good_for: string | null
          id: string
          ingredients: string | null
          key_ingredients: string[]
          made_for: string | null
          product_type: string
          published_at: string
          routine_group: string
          routine_sort: number
          search_keywords: string[]
          seo_description: string | null
          seo_title: string | null
          skin_types: string[]
          slug: string
          sort_order: number
          status: string
          swatch_from: string
          swatch_to: string
          system_step_name: string | null
          texture: string | null
          updated_at: string
          usage_time: string[]
          volume: string | null
        }
        Insert: {
          badge?: string | null
          benefits?: string[]
          catalog_status?: string
          cautions?: string[]
          concerns?: string[]
          created_at?: string
          currency?: string
          display_name: string
          editorial_description: string
          editorial_how_to_use: string
          finish?: string | null
          formula_notes?: string[]
          good_for?: string | null
          id?: string
          ingredients?: string | null
          key_ingredients?: string[]
          made_for?: string | null
          product_type: string
          published_at?: string
          routine_group: string
          routine_sort: number
          search_keywords?: string[]
          seo_description?: string | null
          seo_title?: string | null
          skin_types?: string[]
          slug: string
          sort_order: number
          status?: string
          swatch_from: string
          swatch_to: string
          system_step_name?: string | null
          texture?: string | null
          updated_at?: string
          usage_time?: string[]
          volume?: string | null
        }
        Update: {
          badge?: string | null
          benefits?: string[]
          catalog_status?: string
          cautions?: string[]
          concerns?: string[]
          created_at?: string
          currency?: string
          display_name?: string
          editorial_description?: string
          editorial_how_to_use?: string
          finish?: string | null
          formula_notes?: string[]
          good_for?: string | null
          id?: string
          ingredients?: string | null
          key_ingredients?: string[]
          made_for?: string | null
          product_type?: string
          published_at?: string
          routine_group?: string
          routine_sort?: number
          search_keywords?: string[]
          seo_description?: string | null
          seo_title?: string | null
          skin_types?: string[]
          slug?: string
          sort_order?: number
          status?: string
          swatch_from?: string
          swatch_to?: string
          system_step_name?: string | null
          texture?: string | null
          updated_at?: string
          usage_time?: string[]
          volume?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_system_step_routine_group_fkey"
            columns: ["system_step_name", "routine_group"]
            isOneToOne: false
            referencedRelation: "system_steps"
            referencedColumns: ["name", "routine_group"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          first_name: string | null
          last_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          last_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          last_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_attributions: {
        Row: {
          created_at: string
          id: string
          order_id: string | null
          qualified_at: string | null
          referee_user_id: string | null
          referral_code_id: string
          referrer_user_id: string
          source_key: string
          status: Database["public"]["Enums"]["referral_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id?: string | null
          qualified_at?: string | null
          referee_user_id?: string | null
          referral_code_id: string
          referrer_user_id: string
          source_key: string
          status?: Database["public"]["Enums"]["referral_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string | null
          qualified_at?: string | null
          referee_user_id?: string | null
          referral_code_id?: string
          referrer_user_id?: string
          source_key?: string
          status?: Database["public"]["Enums"]["referral_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_attributions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_attributions_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          consumed_at: string | null
          consumed_order_id: string | null
          created_at: string
          discount_percent: number
          id: string
          minimum_subtotal_cents: number
          referral_attribution_id: string
          source_key: string
          status: Database["public"]["Enums"]["referral_reward_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_order_id?: string | null
          created_at?: string
          discount_percent?: number
          id?: string
          minimum_subtotal_cents?: number
          referral_attribution_id: string
          source_key: string
          status?: Database["public"]["Enums"]["referral_reward_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          consumed_order_id?: string | null
          created_at?: string
          discount_percent?: number
          id?: string
          minimum_subtotal_cents?: number
          referral_attribution_id?: string
          source_key?: string
          status?: Database["public"]["Enums"]["referral_reward_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_rewards_consumed_order_id_fkey"
            columns: ["consumed_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_rewards_referral_attribution_id_fkey"
            columns: ["referral_attribution_id"]
            isOneToOne: false
            referencedRelation: "referral_attributions"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_customers: {
        Row: {
          checkout_environment: Database["public"]["Enums"]["checkout_environment"]
          created_at: string
          email: string | null
          id: string
          stripe_customer_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checkout_environment?: Database["public"]["Enums"]["checkout_environment"]
          created_at?: string
          email?: string | null
          id?: string
          stripe_customer_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checkout_environment?: Database["public"]["Enums"]["checkout_environment"]
          created_at?: string
          email?: string | null
          id?: string
          stripe_customer_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          checkout_environment: Database["public"]["Enums"]["checkout_environment"]
          created_at: string
          livemode: boolean
          payload: Json
          processed_at: string | null
          processing_error: string | null
          stripe_event_id: string
          type: string
        }
        Insert: {
          checkout_environment?: Database["public"]["Enums"]["checkout_environment"]
          created_at?: string
          livemode?: boolean
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          stripe_event_id: string
          type: string
        }
        Update: {
          checkout_environment?: Database["public"]["Enums"]["checkout_environment"]
          created_at?: string
          livemode?: boolean
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          stripe_event_id?: string
          type?: string
        }
        Relationships: []
      }
      system_steps: {
        Row: {
          name: string
          position: number
          routine_group: string
        }
        Insert: {
          name: string
          position: number
          routine_group: string
        }
        Update: {
          name?: string
          position?: number
          routine_group?: string
        }
        Relationships: []
      }
      trustpilot_invitation_attempts: {
        Row: {
          blocked_reason: string
          created_at: string
          id: string
          metadata: Json
          order_id: string | null
          status: Database["public"]["Enums"]["trustpilot_invitation_status"]
          user_id: string | null
        }
        Insert: {
          blocked_reason?: string
          created_at?: string
          id?: string
          metadata?: Json
          order_id?: string | null
          status?: Database["public"]["Enums"]["trustpilot_invitation_status"]
          user_id?: string | null
        }
        Update: {
          blocked_reason?: string
          created_at?: string
          id?: string
          metadata?: Json
          order_id?: string | null
          status?: Database["public"]["Enums"]["trustpilot_invitation_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trustpilot_invitation_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      attach_checkout_session: {
        Args: {
          p_attempt_token: string
          p_customer_id: string
          p_order_id: string
          p_session_id: string
          p_stripe_idempotency_key: string
        }
        Returns: boolean
      }
      award_loyalty_points: {
        Args: {
          p_description: string
          p_entry_type: Database["public"]["Enums"]["loyalty_ledger_entry_type"]
          p_metadata?: Json
          p_order_id?: string
          p_points: number
          p_source_key: string
          p_user_id: string
        }
        Returns: string
      }
      bootstrap_catalog_admin_membership: {
        Args: { p_role: string; p_user_id: string }
        Returns: Json
      }
      cancel_checkout_order_without_session: {
        Args: { p_order_id: string; p_reason: string }
        Returns: boolean
      }
      cart_add_item_delta: {
        Args: {
          p_cart_id: string
          p_product_id: string
          p_quantity_delta: number
          p_variant_key: string
        }
        Returns: {
          line_id: string
          quantity: number
        }[]
      }
      cart_clear_items: { Args: { p_cart_id: string }; Returns: number }
      cart_remove_item: {
        Args: { p_cart_id: string; p_line_id: string }
        Returns: boolean
      }
      cart_set_item_quantity: {
        Args: { p_cart_id: string; p_line_id: string; p_quantity: number }
        Returns: {
          line_id: string
          quantity: number
        }[]
      }
      claim_checkout_attempt: { Args: { p_order_id: string }; Returns: string }
      cleanup_expired_guest_carts: {
        Args: { p_apply: boolean; p_limit: number }
        Returns: {
          deleted_count: number
          matched_count: number
        }[]
      }
      clear_paid_order_cart: { Args: { p_order_id: string }; Returns: number }
      create_catalog_product_draft: {
        Args: { p_actor_id: string; p_product_id: string }
        Returns: Json
      }
      enroll_product_waitlist: {
        Args: {
          p_abuse_key: string
          p_marketing_consent: boolean
          p_normalized_email: string
          p_policy_version: string
          p_product_id: string
          p_source: string
        }
        Returns: Json
      }
      ensure_loyalty_account: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      expire_checkout_order_from_stripe: {
        Args: { p_order_id: string; p_reason: string; p_session_id: string }
        Returns: boolean
      }
      fail_checkout_attempt: {
        Args: {
          p_attempt_token: string
          p_order_id: string
          p_reason: string
          p_release_rewards: boolean
        }
        Returns: boolean
      }
      fail_checkout_order_from_stripe:
        | { Args: { p_order_id: string; p_reason: string }; Returns: boolean }
        | {
            Args: { p_order_id: string; p_reason: string; p_session_id: string }
            Returns: boolean
          }
      finalize_paid_checkout_order: {
        Args: {
          p_billing_address: Json
          p_customer_email: string
          p_customer_id: string
          p_discount_cents: number
          p_order_id: string
          p_payment_intent_id: string
          p_payment_method_type: string
          p_payment_raw_status: string
          p_reward_points_earned: number
          p_session_id: string
          p_shipping_address: Json
          p_shipping_cents: number
          p_shipping_name: string
          p_tax_cents: number
          p_total_cents: number
        }
        Returns: {
          billing_address: Json
          cancelled_at: string | null
          cart_id: string | null
          checkout_attempt_started_at: string | null
          checkout_attempt_token: string | null
          checkout_environment: Database["public"]["Enums"]["checkout_environment"]
          checkout_generation: string | null
          created_at: string
          currency: string
          customer_email: string | null
          discount_cents: number
          id: string
          idempotency_key: string
          merchandise_subtotal_cents: number
          metadata: Json
          order_number: string
          paid_at: string | null
          referral_code: string | null
          refunded_at: string | null
          reward_discount_cents: number
          reward_points_earned: number
          reward_points_redeemed: number
          shipping_address: Json
          shipping_cents: number
          shipping_name: string | null
          status: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          tax_cents: number
          total_cents: number
          updated_at: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_catalog_editor_document: {
        Args: { p_product_id: string }
        Returns: Json
      }
      merge_guest_cart: {
        Args: { p_guest_token_hash: string; p_user_id: string }
        Returns: string
      }
      prepare_checkout_attempt: {
        Args: {
          p_attempt_token: string
          p_detach_session: boolean
          p_expected_session_id: string
          p_order_id: string
          p_stripe_idempotency_key: string
        }
        Returns: boolean
      }
      publish_catalog_product_draft: {
        Args: {
          p_actor_id: string
          p_actor_role: string
          p_change_audit: Json
          p_draft_id: string
          p_expected_version: number
        }
        Returns: Json
      }
      publish_catalog_product_draft_v4: {
        Args: {
          p_actor_id: string
          p_actor_role: string
          p_change_audit: Json
          p_draft_id: string
          p_expected_version: number
        }
        Returns: Json
      }
      redeem_loyalty_points: {
        Args: {
          p_amount_cents: number
          p_description: string
          p_order_id?: string
          p_points: number
          p_source_key: string
          p_user_id: string
        }
        Returns: string
      }
      release_checkout_attempt: {
        Args: { p_attempt_token: string; p_order_id: string }
        Returns: boolean
      }
      release_loyalty_redemptions_for_order: {
        Args: { p_order_id: string; p_reason: string; p_user_id: string }
        Returns: number
      }
      replace_catalog_product_slug: {
        Args: {
          p_actor_id: string
          p_source_product_id: string
          p_target_product_id: string
        }
        Returns: Json
      }
      replace_catalog_product_slug_v1: {
        Args: {
          p_actor_id: string
          p_source_product_id: string
          p_target_product_id: string
        }
        Returns: Json
      }
      reserve_checkout_order_snapshot: {
        Args: {
          p_cart_id: string
          p_checkout_environment: string
          p_currency: string
          p_customer_email: string
          p_discount_cents: number
          p_idempotency_key: string
          p_items: Json
          p_merchandise_subtotal_cents: number
          p_metadata: Json
          p_referral_code: string
          p_reward_discount_cents: number
          p_reward_points_redeemed: number
          p_shipping_cents: number
          p_tax_cents: number
          p_total_cents: number
          p_user_id: string
        }
        Returns: {
          billing_address: Json
          cancelled_at: string | null
          cart_id: string | null
          checkout_attempt_started_at: string | null
          checkout_attempt_token: string | null
          checkout_environment: Database["public"]["Enums"]["checkout_environment"]
          checkout_generation: string | null
          created_at: string
          currency: string
          customer_email: string | null
          discount_cents: number
          id: string
          idempotency_key: string
          merchandise_subtotal_cents: number
          metadata: Json
          order_number: string
          paid_at: string | null
          referral_code: string | null
          refunded_at: string | null
          reward_discount_cents: number
          reward_points_earned: number
          reward_points_redeemed: number
          shipping_address: Json
          shipping_cents: number
          shipping_name: string | null
          status: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          tax_cents: number
          total_cents: number
          updated_at: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reserve_checkout_order_snapshot_v2: {
        Args: {
          p_cart_id: string
          p_checkout_environment: string
          p_checkout_generation: string
          p_currency: string
          p_customer_email: string
          p_discount_cents: number
          p_idempotency_key: string
          p_items: Json
          p_merchandise_subtotal_cents: number
          p_metadata: Json
          p_referral_code: string
          p_reward_discount_cents: number
          p_reward_points_redeemed: number
          p_shipping_cents: number
          p_tax_cents: number
          p_total_cents: number
          p_user_id: string
        }
        Returns: {
          billing_address: Json
          cancelled_at: string | null
          cart_id: string | null
          checkout_attempt_started_at: string | null
          checkout_attempt_token: string | null
          checkout_environment: Database["public"]["Enums"]["checkout_environment"]
          checkout_generation: string | null
          created_at: string
          currency: string
          customer_email: string | null
          discount_cents: number
          id: string
          idempotency_key: string
          merchandise_subtotal_cents: number
          metadata: Json
          order_number: string
          paid_at: string | null
          referral_code: string | null
          refunded_at: string | null
          reward_discount_cents: number
          reward_points_earned: number
          reward_points_redeemed: number
          shipping_address: Json
          shipping_cents: number
          shipping_name: string | null
          status: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          tax_cents: number
          total_cents: number
          updated_at: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      resolve_active_cart: {
        Args: {
          p_create: boolean
          p_guest_token_hash: string
          p_user_id: string
        }
        Returns: {
          cart_id: string
          expired: boolean
          expires_at: string
          guest_token_hash: string
          status: Database["public"]["Enums"]["cart_status"]
          user_id: string
        }[]
      }
      resolve_product_slug: {
        Args: { p_source_slug: string }
        Returns: {
          route_kind: string
          source_slug: string
          target_product_id: string
          target_slug: string
        }[]
      }
      restore_catalog_product_revision: {
        Args: { p_actor_id: string; p_revision_id: string }
        Returns: Json
      }
      retire_checkout_generation: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      save_catalog_product_draft: {
        Args: {
          p_actor_id: string
          p_actor_role: string
          p_document: Json
          p_draft_id: string
          p_expected_version: number
        }
        Returns: Json
      }
      transition_catalog_product_draft: {
        Args: {
          p_action: string
          p_actor_id: string
          p_draft_id: string
          p_expected_version: number
          p_validation_errors: Json
        }
        Returns: Json
      }
    }
    Enums: {
      cart_status: "active" | "merged" | "abandoned"
      checkout_environment: "sandbox"
      loyalty_ledger_entry_type:
        | "welcome"
        | "purchase_earn"
        | "purchase_refund"
        | "redemption_reserved"
        | "redemption_captured"
        | "redemption_released"
        | "redemption_reversal"
        | "referral_entitlement_issued"
        | "referral_entitlement_reserved"
        | "referral_entitlement_consumed"
        | "referral_entitlement_released"
        | "private_feedback"
        | "manual_adjustment"
      loyalty_ledger_status: "pending" | "posted" | "void"
      loyalty_redemption_status: "pending" | "applied" | "void" | "reversed"
      order_status:
        | "draft"
        | "pending_payment"
        | "paid"
        | "payment_failed"
        | "cancelled"
        | "refunded"
      payment_attempt_status:
        | "requires_payment"
        | "processing"
        | "paid"
        | "failed"
        | "cancelled"
        | "refunded"
      private_feedback_status: "available" | "submitted" | "rewarded" | "void"
      referral_reward_status: "available" | "reserved" | "consumed" | "void"
      referral_status: "pending" | "qualified" | "rewarded" | "void"
      trustpilot_invitation_status: "blocked_private_feedback_only"
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
      cart_status: ["active", "merged", "abandoned"],
      checkout_environment: ["sandbox"],
      loyalty_ledger_entry_type: [
        "welcome",
        "purchase_earn",
        "purchase_refund",
        "redemption_reserved",
        "redemption_captured",
        "redemption_released",
        "redemption_reversal",
        "referral_entitlement_issued",
        "referral_entitlement_reserved",
        "referral_entitlement_consumed",
        "referral_entitlement_released",
        "private_feedback",
        "manual_adjustment",
      ],
      loyalty_ledger_status: ["pending", "posted", "void"],
      loyalty_redemption_status: ["pending", "applied", "void", "reversed"],
      order_status: [
        "draft",
        "pending_payment",
        "paid",
        "payment_failed",
        "cancelled",
        "refunded",
      ],
      payment_attempt_status: [
        "requires_payment",
        "processing",
        "paid",
        "failed",
        "cancelled",
        "refunded",
      ],
      private_feedback_status: ["available", "submitted", "rewarded", "void"],
      referral_reward_status: ["available", "reserved", "consumed", "void"],
      referral_status: ["pending", "qualified", "rewarded", "void"],
      trustpilot_invitation_status: ["blocked_private_feedback_only"],
    },
  },
} as const
