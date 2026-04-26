defmodule Back.Repo.Migrations.AddLiveStateFieldsToMatches do
  use Ecto.Migration

  def change do
    alter table(:matches) do
      add :live_state_version, :integer, null: false, default: 0
      add :live_event_seq, :bigint, null: false, default: 0
      add :current_innings, :integer, null: false, default: 0
      add :current_over, :decimal, precision: 8, scale: 2
      add :current_ball_in_over, :integer, null: false, default: 0
      add :batting_team, :string
      add :bowling_team, :string
      add :runs_total, :integer, null: false, default: 0
      add :wickets_total, :integer, null: false, default: 0
      add :target_runs, :integer
      add :required_run_rate, :decimal, precision: 8, scale: 3
      add :current_run_rate, :decimal, precision: 8, scale: 3
      add :momentum_index, :decimal, precision: 8, scale: 3
      add :market_state, :map, null: false, default: %{}
      add :last_ball_event_type, :string
      add :last_live_event_at, :utc_datetime
      add :suspended_at, :utc_datetime
      add :suspension_reason, :string
    end

    create index(:matches, [:competition_feed_id, :status, :start_time],
             name: :matches_feed_status_start_time_index
           )

    create index(:matches, [:status, :last_live_event_at],
             name: :matches_status_last_live_event_at_index
           )

    create index(:matches, [:live_event_seq],
             where: "live_event_seq > 0",
             name: :matches_live_event_seq_index
           )

    create index(:matches, [:suspended_at],
             where: "suspended_at IS NOT NULL",
             name: :matches_suspended_at_index
           )

    create constraint(:matches, :matches_live_state_version_non_negative,
             check: "live_state_version >= 0"
           )

    create constraint(:matches, :matches_live_event_seq_non_negative,
             check: "live_event_seq >= 0"
           )

    create constraint(:matches, :matches_current_innings_non_negative,
             check: "current_innings >= 0"
           )

    create constraint(:matches, :matches_current_ball_in_over_non_negative,
             check: "current_ball_in_over >= 0"
           )

    create constraint(:matches, :matches_runs_total_non_negative, check: "runs_total >= 0")

    create constraint(:matches, :matches_wickets_total_non_negative, check: "wickets_total >= 0")

    create constraint(:matches, :matches_target_runs_non_negative,
             check: "target_runs IS NULL OR target_runs >= 0"
           )
  end
end
