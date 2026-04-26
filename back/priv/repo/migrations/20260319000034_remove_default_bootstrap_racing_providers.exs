defmodule Back.Repo.Migrations.RemoveDefaultBootstrapRacingProviders do
  use Ecto.Migration

  def up do
    execute("""
    DELETE FROM provider_api_controls
    WHERE provider_key IN (
      SELECT p.name
      FROM providers p
      WHERE p.name IN ('goalserve', 'betsapi')
        AND p.api_key IS NULL
        AND p.is_active = FALSE
        AND NOT EXISTS (
          SELECT 1
          FROM competition_feeds f
          WHERE f.provider_id = p.id
        )
    )
    """)

    execute("""
    DELETE FROM providers p
    WHERE p.name IN ('goalserve', 'betsapi')
      AND p.api_key IS NULL
      AND p.is_active = FALSE
      AND NOT EXISTS (
        SELECT 1
        FROM competition_feeds f
        WHERE f.provider_id = p.id
      )
    """)
  end

  def down do
    :ok
  end
end
