defmodule Back.Repo.Migrations.DropProviderApiManagementTables do
  use Ecto.Migration

  def change do
    drop_if_exists table(:provider_api_usage_windows)
    drop_if_exists table(:provider_api_events)
    drop_if_exists table(:provider_api_controls)
  end
end
