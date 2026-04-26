defmodule Back.Repo.Migrations.CreateCompetitionFeeds do
  use Ecto.Migration

  def change do
    create table(:competition_feeds, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :name, :string, null: false
      add :sport, :string, null: false
      add :competition_key, :string, null: false
      add :league_id, :string
      add :season_id, :string
      add :region, :string
      add :track, :string
      add :import_mode, :string, null: false, default: "season"
      add :enabled, :boolean, null: false, default: true
      add :live_sync_enabled, :boolean, null: false, default: true
      add :import_provider_odds, :boolean, null: false, default: false
      add :generate_platform_odds, :boolean, null: false, default: true
      add :upcoming_window_days, :integer, null: false, default: 7
      add :live_start_offset_minutes, :integer, null: false, default: 30
      add :live_poll_interval_seconds, :integer, null: false, default: 30
      add :live_stop_offset_minutes, :integer, null: false, default: 15
      add :config, :map, null: false, default: %{}

      add :provider_id, references(:providers, type: :binary_id, on_delete: :delete_all),
        null: false

      timestamps(type: :utc_datetime)
    end

    create index(:competition_feeds, [:provider_id])
    create index(:competition_feeds, [:sport])
    create index(:competition_feeds, [:enabled])
    create unique_index(:competition_feeds, [:provider_id, :competition_key, :season_id])
  end
end
