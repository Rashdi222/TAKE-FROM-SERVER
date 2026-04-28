# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :back,
  ecto_repos: [Back.Repo],
  generators: [timestamp_type: :utc_datetime]

# Configures the endpoint
config :back, BackWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [html: BackWeb.ErrorHTML, json: BackWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Back.PubSub,
  live_view: [signing_salt: "2IGiGATi"]

# Configures the mailer
#
# By default it uses the "Local" adapter which stores the emails
# locally. You can see the emails in your browser, at "/dev/mailbox".
#
# For production it's recommended to configure a different adapter
# at the `config/runtime.exs`.
config :back, Back.Mailer, adapter: Swoosh.Adapters.Local

# Configure esbuild (the version is required)
config :esbuild,
  version: "0.25.4",
  back: [
    args:
      ~w(js/app.js --bundle --target=es2022 --outdir=../priv/static/assets/js --external:/fonts/* --external:/images/* --alias:@=.),
    cd: Path.expand("../assets", __DIR__),
    env: %{"NODE_PATH" => [Path.expand("../deps", __DIR__), Mix.Project.build_path()]}
  ]

# Configure tailwind (the version is required)
config :tailwind,
  version: "4.1.7",
  back: [
    args: ~w(
      --input=assets/css/app.css
      --output=priv/static/assets/css/app.css
    ),
    cd: Path.expand("..", __DIR__)
  ]

# Configures Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Prevent tzdata from crashing the app when network access is flaky/unavailable.
config :tzdata, :autoupdate, :disabled

# Guardian JWT configuration
config :back, Back.Auth.Guardian,
  issuer: "sixerbat",
  secret_key:
    System.get_env("GUARDIAN_SECRET_KEY") || "dev_secret_change_in_production_min_32_chars!!"

# OpenRouter AI configuration
config :back,
  openrouter_api_key: System.get_env("OPENROUTER_API_KEY") || "",
  openrouter_default_model: System.get_env("OPENROUTER_DEFAULT_MODEL") || "openai/gpt-4o-mini",
  ai_engine_url: System.get_env("AI_ENGINE_URL") || "http://127.0.0.1:8001",
  football_ai_engine_enabled:
    System.get_env("FOOTBALL_AI_ENGINE_ENABLED", "false") in ["1", "true", "TRUE"],
  assistant_python_mock_enabled: false,
  ai_engine_timeout_ms: String.to_integer(System.get_env("AI_ENGINE_TIMEOUT_MS") || "8000"),
  cricket_reprice_queue_enabled:
    System.get_env("CRICKET_REPRICE_QUEUE_ENABLED") not in ["0", "false", "FALSE"],
  provider_cache_redis_enabled:
    System.get_env("PROVIDER_CACHE_REDIS_ENABLED", "true") not in ["0", "false", "FALSE"],
  provider_cache_redis_url:
    System.get_env("PROVIDER_CACHE_REDIS_URL") || System.get_env("MULTI_SOURCE_REDIS_URL") ||
      "redis://127.0.0.1:6379",
  api_sports_live_odds_direct_fallback_enabled:
    System.get_env("API_SPORTS_LIVE_ODDS_DIRECT_FALLBACK_ENABLED", "true") not in [
      "0",
      "false",
      "FALSE"
    ],
  api_sports_live_odds_index_refresh_interval_ms:
    String.to_integer(System.get_env("API_SPORTS_LIVE_ODDS_INDEX_REFRESH_INTERVAL_MS") || "15000"),
  api_sports_live_odds_index_ttl_ms:
    String.to_integer(System.get_env("API_SPORTS_LIVE_ODDS_INDEX_TTL_MS") || "30000"),
  api_sports_live_odds_index_stale_grace_ms:
    String.to_integer(System.get_env("API_SPORTS_LIVE_ODDS_INDEX_STALE_GRACE_MS") || "300000"),
  sportmonks_detail_refresh_max_targets_per_tick:
    String.to_integer(System.get_env("SPORTMONKS_DETAIL_REFRESH_MAX_TARGETS_PER_TICK") || "25"),
  sportmonks_detail_refresh_max_concurrency:
    String.to_integer(System.get_env("SPORTMONKS_DETAIL_REFRESH_MAX_CONCURRENCY") || "4"),
  sportmonks_detail_refresh_unchanged_cooldown_multiplier:
    String.to_integer(
      System.get_env("SPORTMONKS_DETAIL_REFRESH_UNCHANGED_COOLDOWN_MULTIPLIER") || "2"
    ),
  sportmonks_detail_refresh_max_cooldown_ms:
    String.to_integer(System.get_env("SPORTMONKS_DETAIL_REFRESH_MAX_COOLDOWN_MS") || "60000"),
  api_tennis_key: System.get_env("API_TENNIS_KEY") || "",
  goalserve_key: System.get_env("GOALSERVE_KEY") || "",
  betsapi_token: System.get_env("BETSAPI_TOKEN") || "",
  api_tennis_ws_enabled: System.get_env("API_TENNIS_WS_ENABLED") not in ["0", "false", "FALSE"],
  api_management_strict_provider_whitelist:
    System.get_env("API_MANAGEMENT_STRICT_PROVIDER_WHITELIST") in ["1", "true", "TRUE"]

config :back, Oban,
  repo: Back.Repo,
  queues: [data_feeds: 10],
  plugins: [
    {Oban.Plugins.Pruner, max_age: 60 * 60 * 24},
    {Oban.Plugins.Cron,
     crontab: [
       {"*/5 * * * *", Back.Workers.TennisFetchWorker},
       {"*/2 * * * *", Back.Workers.HorseRacingFetchWorker},
       {"* * * * *", Back.Workers.GreyhoundFetchWorker},
       {"*/30 * * * *", Back.Workers.SportsDataReplayWorker},
       {"* * * * *", Back.Workers.MultiSourceCricketOrchestratorWorker},
       {"*/2 * * * *", Back.Workers.MultiSourceRefreshTimeoutWorker},
       {"*/15 * * * *", Back.Workers.MultiSourceMatchmakerPruneWorker}
     ]}
  ]

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
