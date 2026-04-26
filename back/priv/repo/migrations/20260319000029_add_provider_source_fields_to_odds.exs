defmodule Back.Repo.Migrations.AddProviderSourceFieldsToOdds do
  use Ecto.Migration

  def change do
    alter table(:odds) do
      add :source_type, :string, null: false, default: "platform"
      add :source_provider, :string
      add :source_external_id, :string
      add :source_market_key, :string
      add :provider_snapshot, :map
    end

    create index(:odds, [:match_id, :source_type])
    create index(:odds, [:source_provider, :source_external_id])
  end
end
