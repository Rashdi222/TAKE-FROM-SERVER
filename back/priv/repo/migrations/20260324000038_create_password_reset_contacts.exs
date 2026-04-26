defmodule Back.Repo.Migrations.CreatePasswordResetContacts do
  use Ecto.Migration

  def change do
    create table(:password_reset_contacts, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :owner_type, :string, null: false
      add :channel, :string, null: false
      add :label, :string
      add :value, :string, null: false
      add :is_active, :boolean, null: false, default: true
      add :owner_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime)
    end

    create index(:password_reset_contacts, [:owner_type, :owner_id])
    create index(:password_reset_contacts, [:owner_id, :is_active])
  end
end
