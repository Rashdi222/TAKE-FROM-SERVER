defmodule BackWeb.Router do
  use BackWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {BackWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :auth do
    plug BackWeb.Auth.Pipeline
  end

  pipeline :super_admin do
    plug BackWeb.Plugs.EnsureSuperAdmin
  end

  pipeline :master_admin do
    plug BackWeb.Plugs.EnsureMasterAdmin
  end

  pipeline :player do
    plug BackWeb.Plugs.EnsurePlayer
  end

  # ── Public match/odds read routes (any visitor) ───────────────────────────────
  scope "/api", BackWeb do
    pipe_through :api

    post "/auth/register", AuthController, :register
    post "/auth/login", AuthController, :login
    post "/auth/refresh", AuthController, :refresh
    post "/auth/forgot-password-support", PasswordResetSupportController, :lookup
    get "/auth/reset-password/validate", AuthController, :validate_reset_password
    post "/auth/reset-password", AuthController, :reset_password
    get "/settings/account-currencies", SettingsController, :account_currencies
    get "/settings/landing-whatsapp", SettingsController, :landing_whatsapp_contact

    get "/matches", MatchController, :index
    get "/matches/competition-aggregates", MatchController, :competition_aggregates
    get "/matches/:match_id/odds", OddsController, :index
    get "/matches/:id", MatchController, :show
    get "/matches/:id/:slug", MatchController, :show
    get "/tennis/fixtures", TennisController, :public_fixtures
    get "/tennis/live", TennisController, :public_live
    get "/tennis/matches/:event_key", TennisController, :public_match
    get "/tournaments", PublicCompetitionController, :index
    get "/tournaments/:id", PublicCompetitionController, :show

    # EasyPaisa IPN — public, no auth (EasyPaisa posts here)
    post "/payments/easypaisa/callback", PaymentController, :easypaisa_ipn
  end

  scope "/webhooks", BackWeb do
    pipe_through :api

    post "/goalserve", GoalserveWebhookController, :create
  end

  # ── Protected API routes (any authenticated user) ─────────────────────────────
  scope "/api", BackWeb do
    pipe_through [:api, :auth, :player]

    get "/auth/me", AuthController, :me
    post "/auth/logout", AuthController, :logout
  end

  # ── Super Admin routes ────────────────────────────────────────────────────────
  scope "/api/super-admin", BackWeb do
    pipe_through [:api, :auth, :super_admin]

    get "/dashboard", SuperAdminController, :dashboard
    get "/master-admins", SuperAdminController, :list_master_admins
    post "/master-admins", SuperAdminController, :create_master_admin
    get "/master-admins/:id", SuperAdminController, :get_master_admin
    get "/master-admins/:id/stats", SuperAdminController, :master_admin_stats
    post "/master-admins/:id/topup", SuperAdminController, :topup_master_admin
    post "/master-admins/:id/deduct", SuperAdminController, :deduct_master_admin
    post "/transfer", SuperAdminController, :transfer
    post "/manual-payment", SuperAdminController, :manual_payment
    get "/players", SuperAdminController, :list_players
    delete "/users/:id", SuperAdminController, :deactivate_user
    post "/users/:id/risk-controls", SuperAdminController, :update_risk_controls
    post "/users/:id/revoke-session", SuperAdminController, :revoke_session

    # Match management (write ops — super admin only)
    post "/matches", MatchController, :create
    put "/matches/:id", MatchController, :update
    post "/matches/:id/start-live", MatchController, :start_live
    post "/matches/:id/close", MatchController, :close
    post "/matches/:id/settle", MatchController, :settle
    post "/matches/:id/cancel", MatchController, :cancel

    # Odds management (write ops — super admin only)
    post "/matches/:match_id/odds", OddsController, :create
    get "/matches/:match_id/odds", OddsController, :index
    post "/matches/:match_id/odds/generate", OddsController, :generate
    get "/matches/:match_id/provider-odds", OddsController, :provider_reference
    post "/matches/:match_id/provider-odds/import", OddsController, :import_provider_odds
    post "/matches/:id/odds/publish", OddsController, :publish
    post "/matches/:id/odds/unpublish", OddsController, :unpublish
    post "/matches/:id/odds/regenerate", OddsController, :regenerate
    post "/matches/:id/odds/rewrite", OddsController, :rewrite
    post "/matches/:id/odds/orchestrate", OddsController, :orchestrate
    post "/matches/:id/odds/simulate", OddsController, :simulate
    put "/odds/:id", OddsController, :update
    post "/odds/:id/activate", OddsController, :activate
    post "/odds/:id/deactivate", OddsController, :deactivate
    get "/sport-market-configs", SportMarketConfigController, :index
    post "/sport-market-configs", SportMarketConfigController, :upsert

    # Bet monitoring (admin view)
    get "/bets", BetController, :admin_index

    # Payment methods management
    get "/payments/methods", PaymentController, :list_methods
    get "/payments/methods/:id", PaymentController, :show_method
    post "/payments/methods/configure", PaymentController, :configure
    post "/payments/methods/logo/upload", PaymentController, :upload_method_logo
    put "/payments/methods/:id", PaymentController, :update_method
    post "/payments/methods/:id/activate", PaymentController, :activate
    post "/payments/methods/:id/deactivate", PaymentController, :deactivate
    post "/payments/deposits/:id/approve", PaymentController, :approve_deposit
    post "/payments/deposits/:id/reject", PaymentController, :reject_deposit
    post "/payments/withdrawals/:id/approve", PaymentController, :approve_withdrawal
    post "/payments/withdrawals/:id/reject", PaymentController, :reject_withdrawal
    get "/payments/transactions/:id/receipt", PaymentController, :super_admin_receipt
    get "/payments/transactions", PaymentController, :all_transactions
    get "/payments/approvals", PaymentController, :pending_transactions
    get "/payments/approvals/summary", PaymentController, :pending_summary

    # Reports (super admin only)
    get "/reports/stats", ReportController, :platform_stats
    get "/reports/daily", ReportController, :daily
    get "/reports/weekly", ReportController, :weekly
    get "/reports/monthly", ReportController, :monthly
    get "/reports/master-admins", ReportController, :all_master_admins
    get "/reports/cricket-quote-calibration", ReportController, :cricket_quote_calibration

    # Provider management
    get "/providers", ProviderController, :index
    post "/providers", ProviderController, :upsert
    delete "/providers/:id", ProviderController, :delete
    post "/providers/:id/activate", ProviderController, :activate
    post "/providers/:id/enable", ProviderController, :enable
    get "/providers/health", ProviderController, :health
    post "/providers/sync-now", ProviderController, :sync_now
    get "/providers/sync-logs", ProviderController, :sync_logs
    get "/multi-source/match-suggestions", MultiSourceController, :suggestions
    get "/multi-source/health", MultiSourceController, :health
    get "/multi-source/automation-status", MultiSourceController, :automation_status
    get "/multi-source/automation-events", MultiSourceController, :automation_events
    get "/multi-source/polling-profiles", MultiSourceController, :polling_profiles

    post "/multi-source/polling-profiles/:match_id/source-refresh-advisory",
         MultiSourceController,
         :source_refresh_advisory

    post "/multi-source/polling-profiles/:match_id/fetch-source-now",
         MultiSourceController,
         :trigger_source_match_fetch

    post "/multi-source/inject-test-suggestion", MultiSourceController, :inject_test_suggestion
    get "/multi-source/gateways", MultiSourceController, :egress_gateways
    post "/multi-source/gateways", MultiSourceController, :create_egress_gateway
    put "/multi-source/gateways/:id", MultiSourceController, :update_egress_gateway
    delete "/multi-source/gateways/:id", MultiSourceController, :delete_egress_gateway
    get "/multi-source/scraper-configurations", MultiSourceController, :scraper_configurations

    post "/multi-source/scraper-configurations",
         MultiSourceController,
         :create_scraper_configuration

    put "/multi-source/scraper-configurations/:id",
        MultiSourceController,
        :update_scraper_configuration

    delete "/multi-source/scraper-configurations/:id",
           MultiSourceController,
           :delete_scraper_configuration

    post "/multi-source/scraper-configurations/replay",
         MultiSourceController,
         :replay_scraper_configurations

    post "/multi-source/scraper-configurations/:id/replay",
         MultiSourceController,
         :replay_scraper_configuration

    post "/multi-source/match-suggestions/prune-invalid",
         MultiSourceController,
         :prune_invalid_suggestions

    get "/multi-source/canonical-matches", MultiSourceController, :canonical_matches

    post "/multi-source/match-suggestions/:source_name/:source_match_id/approve",
         MultiSourceController,
         :approve_suggestion

    post "/multi-source/match-suggestions/:source_name/:source_match_id/reject",
         MultiSourceController,
         :reject_suggestion

    post "/multi-source/match-suggestions/:source_name/:source_match_id/manual-link",
         MultiSourceController,
         :manual_link_suggestion

    get "/cricket/discovery", ProviderController, :cricket_discovery
    get "/cricket/ai-observability", ProviderController, :cricket_ai_observability
    get "/football/discovery", ProviderController, :football_discovery
    get "/cricket/resolve-season", ProviderController, :resolve_cricket_season
    get "/cricket/automation-runs", ProviderController, :cricket_automation_runs
    get "/football/automation-runs", ProviderController, :football_automation_runs
    get "/competition-feeds", ProviderController, :competition_feeds
    post "/competition-feeds", ProviderController, :create_competition_feed
    delete "/competition-feeds/:id", ProviderController, :delete_competition_feed
    get "/competition-feeds/:id", ProviderController, :get_competition_feed
    get "/competition-feeds/:id/metrics", ProviderController, :competition_feed_metrics
    put "/competition-feeds/:id", ProviderController, :update_competition_feed
    post "/competition-feeds/:id/enable", ProviderController, :enable_competition_feed
    post "/competition-feeds/:id/import", ProviderController, :import_competition_feed

    post "/competition-feeds/:id/refresh-upcoming",
         ProviderController,
         :refresh_competition_feed_upcoming

    post "/competition-feeds/:id/refresh-live", ProviderController, :refresh_competition_feed_live
    get "/sports-data/events", SportsDataController, :events
    get "/sports-data/sync-logs", SportsDataController, :sync_logs
    get "/sports-data/rejections", SportsDataController, :rejections
    post "/sports-data/backfill", SportsDataController, :backfill
    post "/sports-data/replay-rejections", SportsDataController, :replay_rejections
    get "/tennis/fixtures", TennisController, :fixtures
    get "/tennis/live-discovery", TennisController, :live_discovery
    get "/tennis/live", TennisController, :live
    get "/tennis/desk", TennisController, :desk
    get "/tennis/margin", TennisController, :margin
    post "/tennis/margin", TennisController, :update_margin
    get "/tennis/simulation", TennisController, :simulation
    post "/tennis/simulation", TennisController, :update_simulation
    post "/tennis/simulation/inject", TennisController, :inject_simulation
    post "/tennis/tracking/start", TennisController, :start_tracking
    post "/tennis/tracking/stop", TennisController, :stop_tracking
    post "/tennis/publish", TennisController, :publish
    post "/tennis/unpublish", TennisController, :unpublish

    # OpenRouter settings
    get "/settings/openrouter", SettingsController, :openrouter_settings
    get "/settings/openrouter/models", SettingsController, :openrouter_models
    post "/settings/openrouter/model", SettingsController, :set_openrouter_model
    post "/settings/openrouter/key", SettingsController, :set_openrouter_key
    get "/settings/landing-whatsapp", SettingsController, :admin_landing_whatsapp_contact
    put "/settings/landing-whatsapp", SettingsController, :set_landing_whatsapp_contact
    get "/assistant/docs", AdminAssistantController, :list_documents
    post "/assistant/docs/upload", AdminAssistantController, :upload_document
    post "/assistant/docs/:id/approve", AdminAssistantController, :approve_document
    post "/assistant/docs/:id/archive", AdminAssistantController, :archive_document
    get "/assistant/faqs", AdminAssistantController, :list_faqs
    post "/assistant/faqs", AdminAssistantController, :create_faq
    put "/assistant/faqs/:id", AdminAssistantController, :update_faq
    delete "/assistant/faqs/:id", AdminAssistantController, :delete_faq
    post "/assistant/faqs/:id/approve", AdminAssistantController, :approve_faq
    post "/assistant/faqs/:id/archive", AdminAssistantController, :archive_faq
    get "/assistant/faq-drafts", AdminAssistantController, :list_faq_drafts
    post "/assistant/faq-drafts", AdminAssistantController, :create_faq_draft
    put "/assistant/faq-drafts/:id", AdminAssistantController, :update_faq_draft
    delete "/assistant/faq-drafts/:id", AdminAssistantController, :delete_faq_draft
    post "/assistant/faq-drafts/:id/dismiss", AdminAssistantController, :dismiss_faq_draft
    get "/assistant/analytics", AdminAssistantController, :analytics
    get "/settings/account-currencies", SettingsController, :admin_account_currencies
    put "/settings/account-currencies", SettingsController, :update_account_currencies
    get "/reset-support/contacts", PasswordResetSupportController, :super_admin_index
    post "/reset-support/contacts", PasswordResetSupportController, :super_admin_create
    put "/reset-support/contacts/:id", PasswordResetSupportController, :super_admin_update
    delete "/reset-support/contacts/:id", PasswordResetSupportController, :super_admin_delete
  end

  scope "/api/admin", BackWeb do
    pipe_through [:api, :auth, :super_admin]

    post "/matches/:id/emergency_suspend", MatchController, :emergency_suspend
    post "/matches/:id/emergency_resume", MatchController, :emergency_resume
    post "/matches/:id/markets/:market_key/suspend", MatchController, :suspend_market
    post "/matches/:id/markets/:market_key/resume", MatchController, :resume_market
    post "/matches/:id/force_reprice", MatchController, :force_reprice
    post "/matches/:id/manual_override_publish", MatchController, :manual_override_publish
    post "/cricket/emergency_suspend_all", MatchController, :emergency_suspend_all_cricket
  end

  # ── Master Admin routes ───────────────────────────────────────────────────────
  scope "/api/master-admin", BackWeb do
    pipe_through [:api, :auth, :master_admin]

    get "/dashboard", MasterAdminController, :dashboard
    post "/players", MasterAdminController, :create_player
    get "/players", MasterAdminController, :list_players
    post "/players/:id/topup", MasterAdminController, :topup_player
    post "/players/:id/deduct", MasterAdminController, :deduct_player
    get "/players/:id/ledger", MasterAdminController, :player_ledger
    get "/players/:id/stats", MasterAdminController, :player_stats
    get "/players/:id/bets-report", MasterAdminController, :player_bets_report
    get "/players/:id/report-export", MasterAdminController, :player_report_export
    post "/players/:id/set-password", MasterAdminController, :set_player_password

    post "/players/:id/password-reset-link",
         MasterAdminController,
         :generate_player_password_reset_link

    get "/transactions", MasterAdminController, :transactions
    get "/payments/methods", PaymentController, :my_methods
    get "/payments/methods/:id", PaymentController, :show_method
    post "/payments/methods", PaymentController, :configure
    post "/payments/methods/logo/upload", PaymentController, :upload_method_logo
    put "/payments/methods/:id", PaymentController, :update_method
    post "/payments/methods/:id/activate", PaymentController, :activate
    post "/payments/methods/:id/deactivate", PaymentController, :deactivate
    post "/payments/deposits/:id/approve", PaymentController, :approve_deposit
    post "/payments/deposits/:id/reject", PaymentController, :reject_deposit
    post "/payments/withdrawals/:id/approve", PaymentController, :approve_withdrawal
    post "/payments/withdrawals/:id/reject", PaymentController, :reject_withdrawal
    get "/payments/transactions/:id/receipt", PaymentController, :master_admin_receipt
    get "/payments/transactions", PaymentController, :owner_transactions
    get "/payments/approvals", PaymentController, :pending_transactions
    get "/payments/approvals/summary", PaymentController, :pending_summary
    get "/payments/support-contacts", PaymentController, :support_contacts
    get "/reset-support/contacts", PasswordResetSupportController, :master_admin_index
    post "/reset-support/contacts", PasswordResetSupportController, :master_admin_create
    put "/reset-support/contacts/:id", PasswordResetSupportController, :master_admin_update
    delete "/reset-support/contacts/:id", PasswordResetSupportController, :master_admin_delete
  end

  # ── Player / Customer routes ──────────────────────────────────────────────────
  scope "/api/user", BackWeb do
    pipe_through [:api, :auth, :player]

    get "/profile", UserController, :profile
    get "/balance", UserController, :balance
    get "/transactions", UserController, :transactions
    get "/assistant/conversations", UserAssistantController, :list_conversations
    post "/assistant/conversations", UserAssistantController, :create_conversation
    get "/assistant/conversations/:id/messages", UserAssistantController, :list_messages
    post "/assistant/conversations/:id/messages", UserAssistantController, :create_message
  end

  # ── Payment routes (any authenticated user) ───────────────────────────────────
  scope "/api/payments", BackWeb do
    pipe_through [:api, :auth, :player]

    get "/methods", PaymentController, :list_active_methods
    get "/support-contacts", PaymentController, :support_contacts
    post "/deposit", PaymentController, :initiate_deposit
    post "/withdraw", PaymentController, :request_withdrawal
    get "/transactions", PaymentController, :my_transactions
  end

  scope "/api/wallet", BackWeb do
    pipe_through [:api, :auth, :player]

    get "/payment-methods", PaymentController, :list_active_methods
    post "/deposit/upload", PaymentController, :upload_deposit_receipt
  end

  scope "/api", BackWeb do
    pipe_through :api

    get "/payment-method-logos/*path", PaymentController, :public_logo
  end

  # ── Report routes (master admin + super admin) ────────────────────────────────
  scope "/api/reports", BackWeb do
    pipe_through [:api, :auth, :master_admin]

    get "/my", ReportController, :master_admin_report
    get "/ledger", ReportController, :player_ledger
  end

  # ── Betting routes (authenticated players/customers) ──────────────────────────
  scope "/api/bets", BackWeb do
    pipe_through [:api, :auth, :player]

    post "/", BetController, :create
    get "/", BetController, :index
    get "/:id", BetController, :show
    delete "/:id", BetController, :cancel
  end

  scope "/", BackWeb do
    pipe_through :browser

    get "/", PageController, :home
  end

  if Application.compile_env(:back, :dev_routes) do
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :browser

      live_dashboard "/dashboard", metrics: BackWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end
