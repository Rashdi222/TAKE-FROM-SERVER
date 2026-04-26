defmodule Back.Repo.Migrations.CreateProviders do
  use Ecto.Migration

  def change do
    create table(:providers, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :name, :string, null: false
      add :api_key, :string
      add :is_active, :boolean, null: false, default: false
      add :is_enabled, :boolean, null: false, default: true
      add :base_url, :string
      add :config, :map, null: false, default: %{}

      timestamps(type: :utc_datetime)
    end

    create unique_index(:providers, [:name])
    create index(:providers, [:is_active])
    create index(:providers, [:is_enabled])
  end
end
