export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      admin_activity_clears: {
        Row: {
          bot_id: string | null;
          cleared_at: string;
          scope_key: string;
        };
        Insert: {
          bot_id?: string | null;
          cleared_at?: string;
          scope_key: string;
        };
        Update: {
          bot_id?: string | null;
          cleared_at?: string;
          scope_key?: string;
        };
        Relationships: [];
      };
      device_push_tokens: {
        Row: {
          created_at: string;
          last_seen_at: string;
          platform: string;
          token: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          last_seen_at?: string;
          platform: string;
          token: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          last_seen_at?: string;
          platform?: string;
          token?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          download_android_url: string | null;
          download_image_url: string | null;
          download_ios_url: string | null;
          id: number;
          max_users: number;
          maintenance_enabled: boolean;
          maintenance_message: string;
          registration_enabled: boolean;
          registration_message: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          download_android_url?: string | null;
          download_image_url?: string | null;
          download_ios_url?: string | null;
          id?: number;
          max_users?: number;
          maintenance_enabled?: boolean;
          maintenance_message?: string;
          registration_enabled?: boolean;
          registration_message?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          download_android_url?: string | null;
          download_image_url?: string | null;
          download_ios_url?: string | null;
          id?: number;
          max_users?: number;
          maintenance_enabled?: boolean;
          maintenance_message?: string;
          registration_enabled?: boolean;
          registration_message?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      bot_secrets: {
        Row: {
          bot_id: string;
          token: string;
          webhook_secret: string;
        };
        Insert: {
          bot_id: string;
          token: string;
          webhook_secret?: string;
        };
        Update: {
          bot_id?: string;
          token?: string;
          webhook_secret?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bot_secrets_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: true;
            referencedRelation: "bots";
            referencedColumns: ["id"];
          },
        ];
      };
      bot_settings: {
        Row: {
          after_payment_text: string;
          bot_username: string | null;
          cashin_manual_gateway: string | null;
          cashin_mode: string;
          cashout_manual_gateway: string | null;
          cashout_mode: string;
          charge_expiration_minutes: number;
          cta_text: string;
          id: number;
          public_base_url: string;
          updated_at: string;
          welcome_text: string;
        };
        Insert: {
          after_payment_text?: string;
          bot_username?: string | null;
          cashin_manual_gateway?: string | null;
          cashin_mode?: string;
          cashout_manual_gateway?: string | null;
          cashout_mode?: string;
          charge_expiration_minutes?: number;
          cta_text?: string;
          id?: number;
          public_base_url?: string;
          updated_at?: string;
          welcome_text?: string;
        };
        Update: {
          after_payment_text?: string;
          bot_username?: string | null;
          cashin_manual_gateway?: string | null;
          cashin_mode?: string;
          cashout_manual_gateway?: string | null;
          cashout_mode?: string;
          charge_expiration_minutes?: number;
          cta_text?: string;
          id?: number;
          public_base_url?: string;
          updated_at?: string;
          welcome_text?: string;
        };
        Relationships: [];
      };
      community_groups: {
        Row: {
          active: boolean;
          created_at: string;
          description: string | null;
          id: string;
          logo_url: string | null;
          name: string;
          platform: "whatsapp" | "telegram";
          position: number;
          updated_at: string;
          url: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          logo_url?: string | null;
          name: string;
          platform: "whatsapp" | "telegram";
          position?: number;
          updated_at?: string;
          url: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          logo_url?: string | null;
          name?: string;
          platform?: "whatsapp" | "telegram";
          position?: number;
          updated_at?: string;
          url?: string;
        };
        Relationships: [];
      };
      bots: {
        Row: {
          active: boolean;
          after_payment_text: string;
          access_button_text: string;
          created_at: string;
          cta_text: string;
          follow_up_1_text: string;
          follow_up_1_delay_minutes: number;
          follow_up_2_text: string;
          follow_up_2_delay_minutes: number;
          follow_up_3_text: string;
          follow_up_3_delay_minutes: number;
          follow_up_enabled: boolean;
          featured_plan_id: string | null;
          featured_button_text: string;
          featured_button_style: string;
          follow_up_1_button_text: string;
          follow_up_1_button_style: string;
          follow_up_2_button_text: string;
          follow_up_2_button_style: string;
          follow_up_3_button_text: string;
          follow_up_3_button_style: string;
          group_photos: boolean;
          group_videos: boolean;
          id: string;
          media_chat_id: number | null;
          name: string;
          notify_chat_id: number | null;
          offer_button_text: string;
          offer_button_style: string;
          offer_template: string;
          owner_id: string | null;
          photo_data: string | null;
          tg_bot_id: number;
          updated_at: string;
          username: string;
          webhook_url: string | null;
          welcome_text: string;
          start_help_text: string;
        };
        Insert: {
          active?: boolean;
          after_payment_text?: string;
          access_button_text?: string;
          created_at?: string;
          cta_text?: string;
          follow_up_1_text?: string;
          follow_up_1_delay_minutes?: number;
          follow_up_2_text?: string;
          follow_up_2_delay_minutes?: number;
          follow_up_3_text?: string;
          follow_up_3_delay_minutes?: number;
          follow_up_enabled?: boolean;
          featured_plan_id?: string | null;
          featured_button_text?: string;
          featured_button_style?: string;
          follow_up_1_button_text?: string;
          follow_up_1_button_style?: string;
          follow_up_2_button_text?: string;
          follow_up_2_button_style?: string;
          follow_up_3_button_text?: string;
          follow_up_3_button_style?: string;
          group_photos?: boolean;
          group_videos?: boolean;
          id?: string;
          media_chat_id?: number | null;
          name: string;
          notify_chat_id?: number | null;
          offer_button_text?: string;
          offer_button_style?: string;
          offer_template?: string;
          owner_id?: string | null;
          photo_data?: string | null;
          tg_bot_id: number;
          updated_at?: string;
          username: string;
          webhook_url?: string | null;
          welcome_text?: string;
          start_help_text?: string;
        };
        Update: {
          active?: boolean;
          after_payment_text?: string;
          access_button_text?: string;
          created_at?: string;
          cta_text?: string;
          follow_up_1_text?: string;
          follow_up_1_delay_minutes?: number;
          follow_up_2_text?: string;
          follow_up_2_delay_minutes?: number;
          follow_up_3_text?: string;
          follow_up_3_delay_minutes?: number;
          follow_up_enabled?: boolean;
          featured_plan_id?: string | null;
          featured_button_text?: string;
          featured_button_style?: string;
          follow_up_1_button_text?: string;
          follow_up_1_button_style?: string;
          follow_up_2_button_text?: string;
          follow_up_2_button_style?: string;
          follow_up_3_button_text?: string;
          follow_up_3_button_style?: string;
          group_photos?: boolean;
          group_videos?: boolean;
          id?: string;
          media_chat_id?: number | null;
          name?: string;
          notify_chat_id?: number | null;
          offer_button_text?: string;
          offer_button_style?: string;
          offer_template?: string;
          owner_id?: string | null;
          photo_data?: string | null;
          tg_bot_id?: number;
          updated_at?: string;
          username?: string;
          webhook_url?: string | null;
          welcome_text?: string;
          start_help_text?: string;
        };
        Relationships: [];
      };
      bot_start_events: {
        Row: {
          bot_id: string;
          created_at: string;
          id: number;
          owner_id: string;
          tg_user_id: number;
        };
        Insert: {
          bot_id: string;
          created_at?: string;
          id?: number;
          owner_id: string;
          tg_user_id: number;
        };
        Update: {
          bot_id?: string;
          created_at?: string;
          id?: number;
          owner_id?: string;
          tg_user_id?: number;
        };
        Relationships: [];
      };
      bot_test_accounts: {
        Row: {
          created_at: string;
          id: string;
          owner_id: string;
          tg_user_id: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          owner_id: string;
          tg_user_id: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          owner_id?: string;
          tg_user_id?: number;
        };
        Relationships: [];
      };
      bot_message_media: {
        Row: {
          bot_id: string;
          created_at: string;
          id: string;
          media_type: string;
          media_url: string;
          owner_id: string;
          stage: string;
          telegram_file_id: string | null;
          updated_at: string;
        };
        Insert: {
          bot_id: string;
          created_at?: string;
          id?: string;
          media_type: string;
          media_url: string;
          owner_id: string;
          stage: string;
          telegram_file_id?: string | null;
          updated_at?: string;
        };
        Update: {
          bot_id?: string;
          created_at?: string;
          id?: string;
          media_type?: string;
          media_url?: string;
          owner_id?: string;
          stage?: string;
          updated_at?: string;
          telegram_file_id?: string | null;
        };
        Relationships: [];
      };
      recovery_funnels: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recovery_funnel_steps: {
        Row: {
          created_at: string;
          delay_minutes: number;
          funnel_id: string;
          id: string;
          media_type: string | null;
          media_url: string | null;
          message_text: string;
          position: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          delay_minutes: number;
          funnel_id: string;
          id?: string;
          media_type?: string | null;
          media_url?: string | null;
          message_text: string;
          position: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          delay_minutes?: number;
          funnel_id?: string;
          id?: string;
          media_type?: string | null;
          media_url?: string | null;
          message_text?: string;
          position?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      recovery_funnel_bots: {
        Row: {
          bot_id: string;
          created_at: string;
          funnel_id: string;
          owner_id: string;
        };
        Insert: {
          bot_id: string;
          created_at?: string;
          funnel_id: string;
          owner_id: string;
        };
        Update: {
          bot_id?: string;
          created_at?: string;
          funnel_id?: string;
          owner_id?: string;
        };
        Relationships: [];
      };
      recovery_funnel_runs: {
        Row: {
          bot_id: string;
          chat_id: number;
          completed_at: string | null;
          funnel_id: string;
          id: string;
          last_message_ids: number[];
          locked_until: string | null;
          next_at: string;
          step_position: number;
          tg_user_id: number;
          updated_at: string;
        };
        Insert: {
          bot_id: string;
          chat_id: number;
          completed_at?: string | null;
          funnel_id: string;
          id?: string;
          last_message_ids?: number[];
          locked_until?: string | null;
          next_at: string;
          step_position: number;
          tg_user_id: number;
          updated_at?: string;
        };
        Update: {
          bot_id?: string;
          chat_id?: number;
          completed_at?: string | null;
          funnel_id?: string;
          id?: string;
          last_message_ids?: number[];
          locked_until?: string | null;
          next_at?: string;
          step_position?: number;
          tg_user_id?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      recovery_funnel_media_cache: {
        Row: {
          bot_id: string;
          funnel_step_id: string;
          media_id: string;
          telegram_file_id: string;
          updated_at: string;
        };
        Insert: {
          bot_id: string;
          funnel_step_id: string;
          media_id: string;
          telegram_file_id: string;
          updated_at?: string;
        };
        Update: {
          bot_id?: string;
          funnel_step_id?: string;
          media_id?: string;
          telegram_file_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recovery_funnel_step_media: {
        Row: {
          created_at: string;
          funnel_step_id: string;
          id: string;
          media_type: string;
          media_url: string;
          position: number;
        };
        Insert: {
          created_at?: string;
          funnel_step_id: string;
          id?: string;
          media_type: string;
          media_url: string;
          position: number;
        };
        Update: {
          created_at?: string;
          funnel_step_id?: string;
          id?: string;
          media_type?: string;
          media_url?: string;
          position?: number;
        };
        Relationships: [];
      };
      chat_media: {
        Row: {
          bot_id: string | null;
          caption: string | null;
          chat_id: number;
          created_at: string;
          file_id: string;
          id: string;
          media_type: string;
          message_id: number;
        };
        Insert: {
          bot_id?: string | null;
          caption?: string | null;
          chat_id: number;
          created_at?: string;
          file_id: string;
          id?: string;
          media_type: string;
          message_id: number;
        };
        Update: {
          bot_id?: string | null;
          caption?: string | null;
          chat_id?: number;
          created_at?: string;
          file_id?: string;
          id?: string;
          media_type?: string;
          message_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "chat_media_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: false;
            referencedRelation: "bots";
            referencedColumns: ["id"];
          },
        ];
      };
      gateway_logs: {
        Row: {
          created_at: string;
          data: Json | null;
          gateway_id: string | null;
          id: string;
          level: string;
          message: string;
          operation: string;
        };
        Insert: {
          created_at?: string;
          data?: Json | null;
          gateway_id?: string | null;
          id?: string;
          level?: string;
          message: string;
          operation: string;
        };
        Update: {
          created_at?: string;
          data?: Json | null;
          gateway_id?: string | null;
          id?: string;
          level?: string;
          message?: string;
          operation?: string;
        };
        Relationships: [];
      };
      gateway_secrets: {
        Row: {
          credentials: Json;
          gateway_id: string;
          updated_at: string;
        };
        Insert: {
          credentials?: Json;
          gateway_id: string;
          updated_at?: string;
        };
        Update: {
          credentials?: Json;
          gateway_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gateway_secrets_gateway_id_fkey";
            columns: ["gateway_id"];
            isOneToOne: true;
            referencedRelation: "gateways";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_gateway_overrides: {
        Row: {
          credentials: Json;
          gateway_id: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          credentials: Json;
          gateway_id: string;
          updated_at?: string;
          updated_by: string;
        };
        Update: {
          credentials?: Json;
          gateway_id?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [];
      };
      admin_audit_logs: {
        Row: {
          action: string;
          admin_id: string;
          created_at: string;
          details: Json;
          id: number;
          target_id: string;
          target_type: string;
        };
        Insert: {
          action: string;
          admin_id: string;
          created_at?: string;
          details?: Json;
          id?: number;
          target_id: string;
          target_type: string;
        };
        Update: {
          action?: string;
          admin_id?: string;
          created_at?: string;
          details?: Json;
          id?: number;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [];
      };
      gateways: {
        Row: {
          cashin_enabled: boolean;
          cashout_enabled: boolean;
          config: Json;
          created_at: string;
          daily_limit_cents: number | null;
          environment: string;
          fee_fixed_cents: number;
          fee_percent: number;
          id: string;
          last_balance_cents: number | null;
          last_test_at: string | null;
          last_test_message: string | null;
          last_test_ok: boolean | null;
          max_amount_cents: number | null;
          min_amount_cents: number;
          name: string;
          owner_id: string | null;
          priority: number;
          provider: string;
          status: string;
          webhook_token: string;
          weight_cashin: number;
          weight_cashout: number;
        };
        Insert: {
          cashin_enabled?: boolean;
          cashout_enabled?: boolean;
          config?: Json;
          created_at?: string;
          daily_limit_cents?: number | null;
          environment?: string;
          fee_fixed_cents?: number;
          fee_percent?: number;
          id?: string;
          last_balance_cents?: number | null;
          last_test_at?: string | null;
          last_test_message?: string | null;
          last_test_ok?: boolean | null;
          max_amount_cents?: number | null;
          min_amount_cents?: number;
          name: string;
          owner_id?: string | null;
          priority?: number;
          provider: string;
          status?: string;
          webhook_token?: string;
          weight_cashin?: number;
          weight_cashout?: number;
        };
        Update: {
          cashin_enabled?: boolean;
          cashout_enabled?: boolean;
          config?: Json;
          created_at?: string;
          daily_limit_cents?: number | null;
          environment?: string;
          fee_fixed_cents?: number;
          fee_percent?: number;
          id?: string;
          last_balance_cents?: number | null;
          last_test_at?: string | null;
          last_test_message?: string | null;
          last_test_ok?: boolean | null;
          max_amount_cents?: number | null;
          min_amount_cents?: number;
          name?: string;
          owner_id?: string | null;
          priority?: number;
          provider?: string;
          status?: string;
          webhook_token?: string;
          weight_cashin?: number;
          weight_cashout?: number;
        };
        Relationships: [];
      };
      owner_settings: {
        Row: {
          cashin_manual_gateway: string | null;
          cashin_mode: string;
          cashout_manual_gateway: string | null;
          cashout_mode: string;
          charge_expiration_minutes: number;
          owner_id: string;
          store_enabled: boolean;
          store_background_image: string | null;
          store_description: string | null;
          store_headline: string | null;
          store_locale: string;
          store_preview_video_bot_id: string | null;
          store_preview_video_file_id: string | null;
          store_preview_video_message_id: number | null;
          store_slug: string | null;
          store_telegram_contact: string | null;
          store_theme: string;
          updated_at: string;
        };
        Insert: {
          cashin_manual_gateway?: string | null;
          cashin_mode?: string;
          cashout_manual_gateway?: string | null;
          cashout_mode?: string;
          charge_expiration_minutes?: number;
          owner_id?: string;
          store_enabled?: boolean;
          store_background_image?: string | null;
          store_description?: string | null;
          store_headline?: string | null;
          store_locale?: string;
          store_preview_video_bot_id?: string | null;
          store_preview_video_file_id?: string | null;
          store_preview_video_message_id?: number | null;
          store_slug?: string | null;
          store_telegram_contact?: string | null;
          store_theme?: string;
          updated_at?: string;
        };
        Update: {
          cashin_manual_gateway?: string | null;
          cashin_mode?: string;
          cashout_manual_gateway?: string | null;
          cashout_mode?: string;
          charge_expiration_minutes?: number;
          owner_id?: string;
          store_enabled?: boolean;
          store_background_image?: string | null;
          store_description?: string | null;
          store_headline?: string | null;
          store_locale?: string;
          store_preview_video_bot_id?: string | null;
          store_preview_video_file_id?: string | null;
          store_preview_video_message_id?: number | null;
          store_slug?: string | null;
          store_telegram_contact?: string | null;
          store_theme?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fanvue_access_allowlist: {
        Row: { created_at: string; enabled_by: string; user_id: string };
        Insert: { created_at?: string; enabled_by: string; user_id: string };
        Update: { created_at?: string; enabled_by?: string; user_id?: string };
        Relationships: [];
      };
      fanvue_connections: {
        Row: {
          access_token_ciphertext: string;
          creator_name: string | null;
          creator_uuid: string;
          refresh_token_ciphertext: string;
          sales_enabled: boolean;
          token_expires_at: string;
          updated_at: string;
          user_id: string;
          webhook_secret_ciphertext: string;
          webhook_subscription_id: string;
        };
        Insert: {
          access_token_ciphertext: string;
          creator_name?: string | null;
          creator_uuid: string;
          refresh_token_ciphertext: string;
          sales_enabled?: boolean;
          token_expires_at: string;
          updated_at?: string;
          user_id: string;
          webhook_secret_ciphertext: string;
          webhook_subscription_id: string;
        };
        Update: {
          access_token_ciphertext?: string;
          creator_name?: string | null;
          creator_uuid?: string;
          refresh_token_ciphertext?: string;
          sales_enabled?: boolean;
          token_expires_at?: string;
          updated_at?: string;
          user_id?: string;
          webhook_secret_ciphertext?: string;
          webhook_subscription_id?: string;
        };
        Relationships: [];
      };
      fanvue_oauth_states: {
        Row: {
          code_verifier: string;
          created_at: string;
          expires_at: string;
          state_hash: string;
          user_id: string;
        };
        Insert: {
          code_verifier: string;
          created_at?: string;
          expires_at: string;
          state_hash: string;
          user_id: string;
        };
        Update: {
          code_verifier?: string;
          created_at?: string;
          expires_at?: string;
          state_hash?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      fanvue_checkout_links: {
        Row: {
          checkout_link_uuid: string | null;
          checkout_url: string | null;
          id: string;
          owner_id: string;
          plan_id: string;
          price_cents: number;
          product_uuid: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          checkout_link_uuid?: string | null;
          checkout_url?: string | null;
          id?: string;
          owner_id: string;
          plan_id: string;
          price_cents: number;
          product_uuid?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          checkout_link_uuid?: string | null;
          checkout_url?: string | null;
          id?: string;
          owner_id?: string;
          plan_id?: string;
          price_cents?: number;
          product_uuid?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fanvue_webhook_events: {
        Row: {
          event_id: string;
          event_type: string;
          owner_id: string;
          processed_at: string | null;
          received_at: string;
          status: string;
        };
        Insert: {
          event_id: string;
          event_type: string;
          owner_id: string;
          processed_at?: string | null;
          received_at?: string;
          status?: string;
        };
        Update: {
          event_id?: string;
          event_type?: string;
          owner_id?: string;
          processed_at?: string | null;
          received_at?: string;
          status?: string;
        };
        Relationships: [];
      };
      owner_tax_bots: {
        Row: {
          active: boolean;
          apply_to_all_bots: boolean;
          created_at: string;
          id: string;
          image_url: string | null;
          lustify_price_cents: number | null;
          name: string;
          owner_id: string;
          photo_data: string | null;
          tg_bot_id: number;
          updated_at: string;
          username: string;
          webhook_url: string | null;
          welcome_text: string;
        };
        Insert: {
          active?: boolean;
          apply_to_all_bots?: boolean;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          lustify_price_cents?: number | null;
          name: string;
          owner_id: string;
          photo_data?: string | null;
          tg_bot_id: number;
          updated_at?: string;
          username: string;
          webhook_url?: string | null;
          welcome_text?: string;
        };
        Update: {
          active?: boolean;
          apply_to_all_bots?: boolean;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          lustify_price_cents?: number | null;
          name?: string;
          owner_id?: string;
          photo_data?: string | null;
          tg_bot_id?: number;
          updated_at?: string;
          username?: string;
          webhook_url?: string | null;
          welcome_text?: string;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          active: boolean;
          chat_id: number;
          created_at: string;
          description: string | null;
          duration_days: number | null;
          fanvue_price_cents: number | null;
          lustify_price_cents: number | null;
          lustify_price_eur_cents: number | null;
          button_style: string;
          benefits: string[];
          benefits_en: string[];
          benefits_es: string[];
          content_included: string | null;
          content_included_en: string | null;
          content_included_es: string | null;
          id: string;
          image_url: string | null;
          name: string;
          name_en: string | null;
          name_es: string | null;
          description_en: string | null;
          description_es: string | null;
          owner_id: string | null;
          position: number;
          price_cents: number;
        };
        Insert: {
          active?: boolean;
          chat_id: number;
          created_at?: string;
          description?: string | null;
          duration_days?: number | null;
          fanvue_price_cents?: number | null;
          lustify_price_cents?: number | null;
          lustify_price_eur_cents?: number | null;
          button_style?: string;
          benefits?: string[];
          benefits_en?: string[];
          benefits_es?: string[];
          content_included?: string | null;
          content_included_en?: string | null;
          content_included_es?: string | null;
          id?: string;
          image_url?: string | null;
          name: string;
          name_en?: string | null;
          name_es?: string | null;
          description_en?: string | null;
          description_es?: string | null;
          owner_id?: string | null;
          position?: number;
          price_cents: number;
        };
        Update: {
          active?: boolean;
          chat_id?: number;
          created_at?: string;
          description?: string | null;
          duration_days?: number | null;
          fanvue_price_cents?: number | null;
          lustify_price_cents?: number | null;
          lustify_price_eur_cents?: number | null;
          button_style?: string;
          benefits?: string[];
          benefits_en?: string[];
          benefits_es?: string[];
          content_included?: string | null;
          content_included_en?: string | null;
          content_included_es?: string | null;
          id?: string;
          image_url?: string | null;
          name?: string;
          name_en?: string | null;
          name_es?: string | null;
          description_en?: string | null;
          description_es?: string | null;
          owner_id?: string | null;
          position?: number;
          price_cents?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          is_verified: boolean;
          updated_at: string;
          username: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          is_verified?: boolean;
          updated_at?: string;
          username?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          is_verified?: boolean;
          updated_at?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      spoilers: {
        Row: {
          active: boolean;
          bot_id: string | null;
          caption: string | null;
          created_at: string;
          file_id: string | null;
          file_name: string | null;
          id: string;
          media_type: string;
          media_url: string | null;
          owner_id: string | null;
          position: number;
          sync_status: string;
          tg_file_ids: Json;
          tg_message_ids: Json;
        };
        Insert: {
          active?: boolean;
          bot_id?: string | null;
          caption?: string | null;
          created_at?: string;
          file_id?: string | null;
          file_name?: string | null;
          id?: string;
          media_type: string;
          media_url?: string | null;
          owner_id?: string | null;
          position?: number;
          sync_status?: string;
          tg_file_ids?: Json;
          tg_message_ids?: Json;
        };
        Update: {
          active?: boolean;
          bot_id?: string | null;
          caption?: string | null;
          created_at?: string;
          file_id?: string | null;
          file_name?: string | null;
          id?: string;
          media_type?: string;
          media_url?: string | null;
          owner_id?: string | null;
          position?: number;
          sync_status?: string;
          tg_file_ids?: Json;
          tg_message_ids?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "spoilers_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: false;
            referencedRelation: "bots";
            referencedColumns: ["id"];
          },
        ];
      };
      store_access_tokens: {
        Row: {
          created_at: string;
          customer_id: string;
          expires_at: string | null;
          id: string;
          owner_id: string;
          plan_id: string | null;
          redeemed_at: string | null;
          redeemed_by: string | null;
          status: string;
          token_ciphertext: string;
          token_hash: string;
          transaction_id: string;
        };
        Insert: {
          created_at?: string;
          customer_id: string;
          expires_at?: string | null;
          id?: string;
          owner_id: string;
          plan_id?: string | null;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
          status?: string;
          token_ciphertext: string;
          token_hash: string;
          transaction_id: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          expires_at?: string | null;
          id?: string;
          owner_id?: string;
          plan_id?: string | null;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
          status?: string;
          token_ciphertext?: string;
          token_hash?: string;
          transaction_id?: string;
        };
        Relationships: [];
      };
      store_customers: {
        Row: {
          auth_user_id: string;
          created_at: string;
          display_name: string;
          email: string;
          id: string;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          auth_user_id: string;
          created_at?: string;
          display_name: string;
          email: string;
          id?: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string;
          created_at?: string;
          display_name?: string;
          email?: string;
          id?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          bot_id: string | null;
          chat_id: number;
          created_at: string;
          expires_at: string | null;
          id: string;
          invite_link: string | null;
          plan_id: string | null;
          status: string;
          tg_user_id: number;
          transaction_id: string | null;
        };
        Insert: {
          bot_id?: string | null;
          chat_id: number;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          invite_link?: string | null;
          plan_id?: string | null;
          status?: string;
          tg_user_id: number;
          transaction_id?: string | null;
        };
        Update: {
          bot_id?: string | null;
          chat_id?: number;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          invite_link?: string | null;
          plan_id?: string | null;
          status?: string;
          tg_user_id?: number;
          transaction_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: false;
            referencedRelation: "bots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: true;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_chats: {
        Row: {
          bot_id: string | null;
          bot_status: string | null;
          chat_id: number;
          id: string;
          is_admin: boolean;
          title: string | null;
          type: string | null;
          updated_at: string;
          username: string | null;
        };
        Insert: {
          bot_id?: string | null;
          bot_status?: string | null;
          chat_id: number;
          id?: string;
          is_admin?: boolean;
          title?: string | null;
          type?: string | null;
          updated_at?: string;
          username?: string | null;
        };
        Update: {
          bot_id?: string | null;
          bot_status?: string | null;
          chat_id?: number;
          id?: string;
          is_admin?: boolean;
          title?: string | null;
          type?: string | null;
          updated_at?: string;
          username?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_chats_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: false;
            referencedRelation: "bots";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_users: {
        Row: {
          bot_id: string | null;
          chat_id: number;
          created_at: string;
          first_name: string | null;
          id: string;
          language_code: string | null;
          last_seen_at: string;
          photo_data: string | null;
          tg_user_id: number;
          username: string | null;
        };
        Insert: {
          bot_id?: string | null;
          chat_id: number;
          created_at?: string;
          first_name?: string | null;
          id?: string;
          language_code?: string | null;
          last_seen_at?: string;
          photo_data?: string | null;
          tg_user_id: number;
          username?: string | null;
        };
        Update: {
          bot_id?: string | null;
          chat_id?: number;
          created_at?: string;
          first_name?: string | null;
          id?: string;
          language_code?: string | null;
          last_seen_at?: string;
          photo_data?: string | null;
          tg_user_id?: number;
          username?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_users_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: false;
            referencedRelation: "bots";
            referencedColumns: ["id"];
          },
        ];
      };
      tax_bot_secrets: {
        Row: {
          bot_id: string;
          token: string;
          webhook_secret: string;
        };
        Insert: {
          bot_id: string;
          token: string;
          webhook_secret?: string;
        };
        Update: {
          bot_id?: string;
          token?: string;
          webhook_secret?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tax_bot_secrets_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: true;
            referencedRelation: "owner_tax_bots";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          amount_cents: number;
          attempts: Json;
          bot_id: string | null;
          created_at: string;
          delivery_claimed_at: string | null;
          delivered_at: string | null;
          error: string | null;
          checkout_url: string | null;
          fanvue_checkout_link_id: string | null;
          expires_at: string | null;
          fee_cents: number;
          gateway_id: string | null;
          id: string;
          idempotency_key: string;
          kind: string;
          owner_id: string | null;
          original_transaction_id: string | null;
          paid_at: string | null;
          payment_currency: string | null;
          pix_code: string | null;
          plan_id: string | null;
          provider_ref: string | null;
          provider_amount_minor: number | null;
          qr_image: string | null;
          status: string;
          store_customer_id: string | null;
          delivery_mode: string;
          store_plan_name: string | null;
          store_plan_duration_days: number | null;
          store_plan_benefits: string[];
          store_plan_content: string | null;
          tax_fee_applicable: boolean;
          tax_bot_notified_at: string | null;
          tg_user_id: number | null;
        };
        Insert: {
          amount_cents: number;
          attempts?: Json;
          bot_id?: string | null;
          created_at?: string;
          delivery_claimed_at?: string | null;
          delivered_at?: string | null;
          error?: string | null;
          checkout_url?: string | null;
          fanvue_checkout_link_id?: string | null;
          expires_at?: string | null;
          fee_cents?: number;
          gateway_id?: string | null;
          id?: string;
          idempotency_key: string;
          kind?: string;
          owner_id?: string | null;
          original_transaction_id?: string | null;
          paid_at?: string | null;
          payment_currency?: string | null;
          pix_code?: string | null;
          plan_id?: string | null;
          provider_ref?: string | null;
          provider_amount_minor?: number | null;
          qr_image?: string | null;
          status?: string;
          store_customer_id?: string | null;
          delivery_mode?: string;
          store_plan_name?: string | null;
          store_plan_duration_days?: number | null;
          store_plan_benefits?: string[];
          store_plan_content?: string | null;
          tax_fee_applicable?: boolean;
          tax_bot_notified_at?: string | null;
          tg_user_id?: number | null;
        };
        Update: {
          amount_cents?: number;
          attempts?: Json;
          bot_id?: string | null;
          created_at?: string;
          delivery_claimed_at?: string | null;
          delivered_at?: string | null;
          error?: string | null;
          checkout_url?: string | null;
          fanvue_checkout_link_id?: string | null;
          expires_at?: string | null;
          fee_cents?: number;
          gateway_id?: string | null;
          id?: string;
          idempotency_key?: string;
          kind?: string;
          owner_id?: string | null;
          original_transaction_id?: string | null;
          paid_at?: string | null;
          payment_currency?: string | null;
          pix_code?: string | null;
          plan_id?: string | null;
          provider_ref?: string | null;
          provider_amount_minor?: number | null;
          qr_image?: string | null;
          status?: string;
          store_customer_id?: string | null;
          delivery_mode?: string;
          store_plan_name?: string | null;
          store_plan_duration_days?: number | null;
          store_plan_benefits?: string[];
          store_plan_content?: string | null;
          tax_fee_applicable?: boolean;
          tax_bot_notified_at?: string | null;
          tg_user_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: false;
            referencedRelation: "bots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_gateway_id_fkey";
            columns: ["gateway_id"];
            isOneToOne: false;
            referencedRelation: "gateways";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      withdrawals: {
        Row: {
          amount_cents: number;
          attempts: Json;
          created_at: string;
          error: string | null;
          fee_cents: number;
          gateway_id: string | null;
          id: string;
          idempotency_key: string;
          pix_key: string;
          pix_key_type: string;
          provider_ref: string | null;
          requested_by: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          attempts?: Json;
          created_at?: string;
          error?: string | null;
          fee_cents?: number;
          gateway_id?: string | null;
          id?: string;
          idempotency_key: string;
          pix_key: string;
          pix_key_type: string;
          provider_ref?: string | null;
          requested_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          attempts?: Json;
          created_at?: string;
          error?: string | null;
          fee_cents?: number;
          gateway_id?: string | null;
          id?: string;
          idempotency_key?: string;
          pix_key?: string;
          pix_key_type?: string;
          provider_ref?: string | null;
          requested_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "withdrawals_gateway_id_fkey";
            columns: ["gateway_id"];
            isOneToOne: false;
            referencedRelation: "gateways";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      site_maintenance_status: {
        Args: Record<string, never>;
        Returns: {
          is_admin: boolean;
          maintenance_enabled: boolean;
          maintenance_message: string;
        }[];
      };
      claim_transaction_delivery: {
        Args: { _stale_before: string; _transaction_id: string };
        Returns: boolean;
      };
      claim_due_recovery_funnel_runs: {
        Args: { _limit?: number };
        Returns: {
          bot_id: string;
          chat_id: number;
          funnel_id: string;
          run_id: string;
          step_position: number;
          tg_user_id: number;
        }[];
      };
      admin_clear_activity: {
        Args: { _bot_id?: string | null; _updated_by: string };
        Returns: number;
      };
      admin_list_users: {
        Args: {
          _limit?: number;
          _offset?: number;
          _query?: string | null;
        };
        Returns: {
          id: string;
          email: string;
          confirmed: boolean;
          created_at: string;
          display_name: string | null;
          username: string | null;
          total_count: number;
        }[];
      };
      admin_panel_stats: {
        Args: Record<string, never>;
        Returns: {
          user_count: number;
          bot_count: number;
          paid_sales_count: number;
          paid_sales_amount_cents: number;
          start_count: number;
          active_nxgate_count: number;
        }[];
      };
      admin_fanvue_sales_total: {
        Args: Record<string, never>;
        Returns: number;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      owns_bot: { Args: { _bot_id: string }; Returns: boolean };
      owns_gateway: { Args: { _gateway_id: string }; Returns: boolean };
      save_recovery_funnel: {
        Args: {
          _bot_ids: string[];
          _funnel_id: string | null;
          _name: string;
          _steps: Json;
        };
        Returns: string;
      };
      get_buyer_ranking: {
        Args: { _limit?: number };
        Returns: {
          ranking_position: number | null;
          tg_user_id: number | null;
          username: string | null;
          first_name: string | null;
          photo_data: string | null;
          approved_purchases: number | null;
          total_spent_cents: number | null;
          total_buyers: number;
          all_approved_purchases: number;
          all_revenue_cents: number;
        }[];
      };
      get_global_seller_ranking: {
        Args: { _limit?: number };
        Returns: {
          ranking_position: number | null;
          username: string | null;
          display_name: string | null;
          approved_sales: number | null;
          total_sellers: number;
          all_approved_sales: number;
        }[];
      };
    };
    Enums: {
      app_role: "admin" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const;
