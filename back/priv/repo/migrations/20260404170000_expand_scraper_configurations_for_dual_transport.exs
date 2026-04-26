defmodule Back.Repo.Migrations.ExpandScraperConfigurationsForDualTransport do
  use Ecto.Migration

  def change do
    alter table(:scraper_configurations) do
      add :transport, :string, null: false, default: "websocket"
      add :poll_url, :text
      add :proxy_url, :text
    end
  end
end
