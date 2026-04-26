defmodule Back.Repo.Migrations.CreateProviderApiControls do
  use Ecto.Migration

  def change do
    create table(:provider_api_controls, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :provider_key, :string, null: false
      add :enabled, :boolean, null: false, default: true
      add :poll_interval_seconds, :integer
      add :min_delay_ms_between_calls, :integer
      add :max_requests_per_minute, :integer
      add :max_requests_per_hour, :integer
      add :max_requests_per_day, :integer
      add :auto_pause_at_percent, :integer
      add :paused_until, :utc_datetime
      add :notes, :text

      timestamps(type: :utc_datetime)
    end

    create unique_index(:provider_api_controls, [:provider_key])

    create constraint(:provider_api_controls, :provider_api_controls_poll_interval_non_negative,
             check: "poll_interval_seconds IS NULL OR poll_interval_seconds >= 0"
           )

    create constraint(:provider_api_controls, :provider_api_controls_min_delay_non_negative,
             check: "min_delay_ms_between_calls IS NULL OR min_delay_ms_between_calls >= 0"
           )

    create constraint(:provider_api_controls, :provider_api_controls_max_per_minute_non_negative,
             check: "max_requests_per_minute IS NULL OR max_requests_per_minute >= 0"
           )

    create constraint(:provider_api_controls, :provider_api_controls_max_per_hour_non_negative,
             check: "max_requests_per_hour IS NULL OR max_requests_per_hour >= 0"
           )

    create constraint(:provider_api_controls, :provider_api_controls_max_per_day_non_negative,
             check: "max_requests_per_day IS NULL OR max_requests_per_day >= 0"
           )

    create constraint(:provider_api_controls, :provider_api_controls_auto_pause_range,
             check:
               "auto_pause_at_percent IS NULL OR (auto_pause_at_percent >= 1 AND auto_pause_at_percent <= 100)"
           )
  end
end
