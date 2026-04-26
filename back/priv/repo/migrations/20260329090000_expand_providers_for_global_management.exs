defmodule Back.Repo.Migrations.ExpandProvidersForGlobalManagement do
  use Ecto.Migration

  def up do
    alter table(:providers) do
      add :socket_url, :string
      add :auth_mode, :string
      add :headers_template, :map, null: false, default: %{}
      add :query_template, :map, null: false, default: %{}
      add :sport_scope, {:array, :string}, null: false, default: []
    end

    execute("""
    UPDATE providers
    SET
      auth_mode = COALESCE(auth_mode,
        CASE name
          WHEN 'sportmonks' THEN 'query'
          WHEN 'cricketdata' THEN 'query'
          WHEN 'api_sports' THEN 'header'
          WHEN 'allsports' THEN 'query'
          WHEN 'entitysport' THEN 'query'
          WHEN 'goalserve' THEN 'path'
          WHEN 'betsapi' THEN 'query'
          ELSE 'generic'
        END
      ),
      headers_template = CASE
        WHEN headers_template IS NULL OR headers_template = '{}'::jsonb THEN
          CASE name
            WHEN 'api_sports' THEN '{"x-apisports-key":"$API_KEY"}'::jsonb
            ELSE '{}'::jsonb
          END
        ELSE headers_template
      END,
      query_template = CASE
        WHEN query_template IS NULL OR query_template = '{}'::jsonb THEN
          CASE name
            WHEN 'sportmonks' THEN '{"api_token":"$API_KEY"}'::jsonb
            WHEN 'cricketdata' THEN '{"apikey":"$API_KEY"}'::jsonb
            WHEN 'allsports' THEN '{"APIkey":"$API_KEY"}'::jsonb
            WHEN 'entitysport' THEN '{"token":"$API_KEY"}'::jsonb
            WHEN 'betsapi' THEN '{"token":"$API_KEY"}'::jsonb
            ELSE '{}'::jsonb
          END
        ELSE query_template
      END,
      sport_scope = CASE
        WHEN sport_scope IS NULL OR sport_scope = '{}' THEN
          CASE name
            WHEN 'sportmonks' THEN ARRAY['cricket']
            WHEN 'cricketdata' THEN ARRAY['cricket']
            WHEN 'api_sports' THEN ARRAY['football']
            WHEN 'allsports' THEN ARRAY['football']
            WHEN 'entitysport' THEN ARRAY['cricket']
            WHEN 'goalserve' THEN ARRAY['horse_racing']
            WHEN 'betsapi' THEN ARRAY['dog_racing']
            ELSE ARRAY[]::varchar[]
          END
        ELSE sport_scope
      END
    """)

    execute("""
    INSERT INTO providers (
      id,
      name,
      api_key,
      is_active,
      is_enabled,
      base_url,
      socket_url,
      auth_mode,
      headers_template,
      query_template,
      sport_scope,
      config,
      inserted_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      'api_tennis',
      NULL,
      false,
      true,
      'https://api.api-tennis.com/tennis/',
      'wss://wss.api-tennis.com/live',
      'query',
      '{}'::jsonb,
      '{"APIkey":"$API_KEY"}'::jsonb,
      ARRAY['tennis'],
      '{"api_key_param":"APIkey"}'::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (name) DO UPDATE
    SET
      base_url = COALESCE(providers.base_url, EXCLUDED.base_url),
      socket_url = COALESCE(providers.socket_url, EXCLUDED.socket_url),
      auth_mode = COALESCE(providers.auth_mode, EXCLUDED.auth_mode),
      headers_template = CASE
        WHEN providers.headers_template IS NULL OR providers.headers_template = '{}'::jsonb THEN EXCLUDED.headers_template
        ELSE providers.headers_template
      END,
      query_template = CASE
        WHEN providers.query_template IS NULL OR providers.query_template = '{}'::jsonb THEN EXCLUDED.query_template
        ELSE providers.query_template
      END,
      sport_scope = CASE
        WHEN providers.sport_scope IS NULL OR providers.sport_scope = '{}' THEN EXCLUDED.sport_scope
        ELSE providers.sport_scope
      END,
      config = CASE
        WHEN providers.config IS NULL OR providers.config = '{}'::jsonb THEN EXCLUDED.config
        ELSE providers.config || EXCLUDED.config
      END,
      updated_at = NOW()
    """)

    execute("""
    INSERT INTO provider_api_controls (
      id,
      provider_key,
      enabled,
      poll_interval_seconds,
      min_delay_ms_between_calls,
      max_requests_per_minute,
      max_requests_per_hour,
      max_requests_per_day,
      auto_pause_at_percent,
      inserted_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      'api_tennis',
      true,
      15,
      150,
      NULL,
      NULL,
      NULL,
      90,
      NOW(),
      NOW()
    )
    ON CONFLICT (provider_key) DO NOTHING
    """)
  end

  def down do
    execute("DELETE FROM provider_api_controls WHERE provider_key = 'api_tennis'")
    execute("DELETE FROM providers WHERE name = 'api_tennis'")

    alter table(:providers) do
      remove :sport_scope
      remove :query_template
      remove :headers_template
      remove :auth_mode
      remove :socket_url
    end
  end
end
