defmodule Back.Repo.Migrations.AddProviderFieldsToMatches do
  use Ecto.Migration

  def change do
    alter table(:matches) do
      add :external_id, :string
      add :provider, :string
      add :score, :map, default: %{}, null: false
      add :raw_data, :map, default: %{}, null: false
    end

    create index(:matches, [:provider])

    create unique_index(:matches, [:provider, :external_id],
             name: :matches_provider_external_id_index
           )
  end
end
