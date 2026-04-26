defmodule Back.Repo.Migrations.CreateSportMarketConfigs do
  use Ecto.Migration

  def change do
    create table(:sport_market_configs, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :sport, :sport_type, null: false
      add :bet_type, :bet_type, null: false
      add :default_min_odds, :decimal, precision: 8, scale: 2, null: false
      add :default_max_odds, :decimal, precision: 8, scale: 2, null: false
      add :default_max_stake_amount, :decimal, precision: 18, scale: 2
      add :default_max_payout_amount, :decimal, precision: 18, scale: 2
      add :is_enabled, :boolean, null: false, default: true

      timestamps(type: :utc_datetime)
    end

    create unique_index(:sport_market_configs, [:sport, :bet_type])
    create index(:sport_market_configs, [:is_enabled])
  end
end
