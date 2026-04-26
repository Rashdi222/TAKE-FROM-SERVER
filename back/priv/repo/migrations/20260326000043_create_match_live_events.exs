defmodule Back.Repo.Migrations.CreateMatchLiveEvents do
  use Ecto.Migration

  def change do
    create table(:match_live_events, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :match_id, references(:matches, type: :binary_id, on_delete: :delete_all), null: false
      add :provider, :string
      add :provider_event_id, :string
      add :event_seq, :bigint, null: false
      add :state_version, :integer, null: false, default: 0
      add :event_type, :string, null: false
      add :severity, :string, null: false, default: "minor"
      add :inning, :integer, null: false, default: 0
      add :over, :decimal, precision: 8, scale: 2
      add :ball_in_over, :integer, null: false, default: 0
      add :event_time, :utc_datetime
      add :source_status, :string
      add :suspension_trigger, :boolean, null: false, default: false
      add :processed_at, :utc_datetime
      add :payload, :map, null: false, default: %{}

      timestamps(type: :utc_datetime)
    end

    create unique_index(:match_live_events, [:match_id, :event_seq],
             name: :match_live_events_match_id_event_seq_index
           )

    create unique_index(:match_live_events, [:provider, :provider_event_id],
             where: "provider IS NOT NULL AND provider_event_id IS NOT NULL",
             name: :match_live_events_provider_event_id_index
           )

    create index(:match_live_events, [:match_id, :event_time],
             name: :match_live_events_match_id_event_time_index
           )

    create index(:match_live_events, [:match_id, :processed_at],
             name: :match_live_events_match_id_processed_at_index
           )

    create constraint(:match_live_events, :match_live_events_event_seq_non_negative,
             check: "event_seq >= 0"
           )

    create constraint(:match_live_events, :match_live_events_state_version_non_negative,
             check: "state_version >= 0"
           )

    create constraint(:match_live_events, :match_live_events_inning_non_negative,
             check: "inning >= 0"
           )

    create constraint(:match_live_events, :match_live_events_ball_in_over_non_negative,
             check: "ball_in_over >= 0"
           )
  end
end
