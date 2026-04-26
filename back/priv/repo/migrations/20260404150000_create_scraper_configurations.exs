defmodule Back.Repo.Migrations.CreateScraperConfigurations do
  use Ecto.Migration

  def change do
    create table(:scraper_configurations, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :source_name, :string, null: false
      add :bootstrap_url, :text
      add :ws_url, :text
      add :is_active, :boolean, null: false, default: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:scraper_configurations, [:source_name])
  end
end
