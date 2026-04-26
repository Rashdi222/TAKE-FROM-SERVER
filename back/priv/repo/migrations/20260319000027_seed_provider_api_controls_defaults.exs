defmodule Back.Repo.Migrations.SeedProviderApiControlsDefaults do
  use Ecto.Migration

  def up do
    execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

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
    SELECT
      gen_random_uuid(),
      p.name,
      true,
      60,
      200,
      NULL,
      NULL,
      NULL,
      90,
      NOW(),
      NOW()
    FROM providers p
    WHERE p.is_active = true
    ON CONFLICT (provider_key) DO NOTHING
    """)
  end

  def down do
    :ok
  end
end
