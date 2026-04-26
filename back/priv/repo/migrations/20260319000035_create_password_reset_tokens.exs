defmodule Back.Repo.Migrations.CreatePasswordResetTokens do
  use Ecto.Migration

  def change do
    create table(:password_reset_tokens, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :created_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :purpose, :string, null: false, default: "player_password_reset"
      add :token_hash, :string, null: false
      add :expires_at, :utc_datetime, null: false
      add :used_at, :utc_datetime

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create unique_index(:password_reset_tokens, [:token_hash])
    create index(:password_reset_tokens, [:user_id, :purpose])
    create index(:password_reset_tokens, [:expires_at])
    create index(:password_reset_tokens, [:used_at])
  end
end
