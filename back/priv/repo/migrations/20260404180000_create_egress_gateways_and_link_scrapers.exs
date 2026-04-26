defmodule Back.Repo.Migrations.CreateEgressGatewaysAndLinkScrapers do
  use Ecto.Migration

  def change do
    create table(:egress_gateways, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :name, :string, null: false
      add :url, :text
      add :is_default_direct, :boolean, null: false, default: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:egress_gateways, [:name])

    alter table(:scraper_configurations) do
      add :gateway_id, references(:egress_gateways, type: :binary_id, on_delete: :nilify_all)
    end

    create index(:scraper_configurations, [:gateway_id])
  end
end
