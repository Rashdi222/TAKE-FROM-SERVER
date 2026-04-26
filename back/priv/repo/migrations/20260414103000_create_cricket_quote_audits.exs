defmodule Back.Repo.Migrations.CreateCricketQuoteAudits do
  use Ecto.Migration

  def change do
    create table(:cricket_quote_audits, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :match_id, references(:matches, type: :binary_id, on_delete: :delete_all), null: false
      add :odds_id, references(:odds, type: :binary_id, on_delete: :nilify_all)
      add :state_version, :integer, null: false
      add :event_seq, :integer, null: false
      add :market_key, :string, null: false
      add :selection_key, :string, null: false
      add :published_price, :decimal, null: false
      add :confidence_score, :float
      add :valid_for_ms, :integer
      add :reviewer_decision, :string
      add :reviewer_flags, {:array, :string}, default: []
      add :active_playbooks, {:array, :string}, default: []
      add :lifecycle_analytics, :map, default: %{}
      add :fair_probability, :float
      add :display_probability, :float
      add :approved_probability, :float
      add :reference_source, :string
      add :reference_price, :decimal
      add :reference_probability, :float
      add :reference_probability_delta, :float
      add :eventual_match_status, :string
      add :eventual_winner, :string
      add :resolved_at, :utc_datetime

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:cricket_quote_audits, [:match_id, :inserted_at])
    create index(:cricket_quote_audits, [:match_id, :market_key, :selection_key])
    create index(:cricket_quote_audits, [:reference_probability_delta])
    create index(:cricket_quote_audits, [:eventual_match_status])
  end
end
