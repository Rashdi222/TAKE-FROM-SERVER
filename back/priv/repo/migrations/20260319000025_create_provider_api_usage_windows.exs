defmodule Back.Repo.Migrations.CreateProviderApiUsageWindows do
  use Ecto.Migration

  def change do
    create table(:provider_api_usage_windows, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :provider_key, :string, null: false
      add :window_type, :string, null: false
      add :window_start_utc, :utc_datetime, null: false
      add :request_count, :integer, null: false, default: 0
      add :success_count, :integer, null: false, default: 0
      add :failure_count, :integer, null: false, default: 0
      add :blocked_count, :integer, null: false, default: 0

      timestamps(type: :utc_datetime)
    end

    create unique_index(
             :provider_api_usage_windows,
             [:provider_key, :window_type, :window_start_utc],
             name: :provider_api_usage_windows_provider_key_window_type_start_unique
           )

    create index(:provider_api_usage_windows, [:window_type, :window_start_utc])

    create constraint(
             :provider_api_usage_windows,
             :provider_api_usage_windows_window_type_allowed,
             check: "window_type IN ('minute', 'hour', 'day')"
           )

    create constraint(
             :provider_api_usage_windows,
             :provider_api_usage_windows_request_count_non_negative,
             check: "request_count >= 0"
           )

    create constraint(
             :provider_api_usage_windows,
             :provider_api_usage_windows_success_count_non_negative,
             check: "success_count >= 0"
           )

    create constraint(
             :provider_api_usage_windows,
             :provider_api_usage_windows_failure_count_non_negative,
             check: "failure_count >= 0"
           )

    create constraint(
             :provider_api_usage_windows,
             :provider_api_usage_windows_blocked_count_non_negative,
             check: "blocked_count >= 0"
           )
  end
end
