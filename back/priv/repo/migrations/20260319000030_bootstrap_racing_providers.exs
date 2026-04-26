defmodule Back.Repo.Migrations.BootstrapRacingProviders do
  use Ecto.Migration

  def up do
    execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    execute("""
    INSERT INTO providers (
      id,
      name,
      api_key,
      is_active,
      is_enabled,
      base_url,
      config,
      inserted_at,
      updated_at
    )
    VALUES
      (
        gen_random_uuid(),
        'goalserve',
        NULL,
        false,
        true,
        'http://www.goalserve.com/getfeed',
        '{"sport":"horse_racing","timezone":"Europe/London"}'::jsonb,
        NOW(),
        NOW()
      ),
      (
        gen_random_uuid(),
        'betsapi',
        NULL,
        false,
        true,
        'https://api.b365api.com',
        '{"sport":"dog_racing"}'::jsonb,
        NOW(),
        NOW()
      )
    ON CONFLICT (name) DO UPDATE
    SET
      is_enabled = EXCLUDED.is_enabled,
      base_url = COALESCE(providers.base_url, EXCLUDED.base_url),
      config = CASE
        WHEN providers.config IS NULL OR providers.config = '{}'::jsonb THEN EXCLUDED.config
        ELSE providers.config
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
    VALUES
      (
        gen_random_uuid(),
        'goalserve',
        true,
        60,
        500,
        NULL,
        NULL,
        NULL,
        90,
        NOW(),
        NOW()
      ),
      (
        gen_random_uuid(),
        'betsapi',
        true,
        60,
        200,
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
    execute("""
    DELETE FROM provider_api_controls
    WHERE provider_key IN ('goalserve', 'betsapi')
    """)

    execute("""
    DELETE FROM providers
    WHERE name IN ('goalserve', 'betsapi')
    """)
  end
end
