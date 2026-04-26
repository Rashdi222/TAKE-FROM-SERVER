defmodule Back.Repo.Migrations.AddExecutionContextToBets do
  use Ecto.Migration

  def change do
    alter table(:bets) do
      add :match_state_version, :integer, null: false, default: 0
      add :odds_version_no, :integer, null: false, default: 0
      add :market_key, :string
      add :selection_key, :string
      add :quoted_odds_value, :decimal, precision: 12, scale: 4
      add :accepted_at, :utc_datetime
      add :rejected_reason, :string
      add :client_snapshot, :map, null: false, default: %{}
    end

    create index(:bets, [:match_id, :match_state_version], name: :bets_match_state_version_index)

    create index(:bets, [:odds_id, :odds_version_no], name: :bets_odds_version_no_index)

    create index(:bets, [:user_id, :status, :inserted_at],
             name: :bets_user_status_inserted_at_index
           )

    create constraint(:bets, :bets_match_state_version_non_negative,
             check: "match_state_version >= 0"
           )

    create constraint(:bets, :bets_odds_version_no_non_negative, check: "odds_version_no >= 0")

    create constraint(:bets, :bets_quoted_odds_value_positive,
             check: "quoted_odds_value IS NULL OR quoted_odds_value > 0"
           )
  end
end
