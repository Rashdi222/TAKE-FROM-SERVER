defmodule Back.Repo.Migrations.CreateUsers do
  use Ecto.Migration

  def change do
    execute(
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN CREATE TYPE user_role AS ENUM ('super_admin','master_admin','player','customer'); END IF; END $$;",
      "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN DROP TYPE user_role; END IF; END $$;"
    )

    execute(
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'master_admin_type') THEN CREATE TYPE master_admin_type AS ENUM ('volume_based','loss_based'); END IF; END $$;",
      "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'master_admin_type') THEN DROP TYPE master_admin_type; END IF; END $$;"
    )

    create table(:users, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :email, :string, null: false
      add :password_hash, :string, null: false
      add :role, :user_role, null: false, default: "customer"
      add :balance, :decimal, precision: 15, scale: 2, null: false, default: 0
      add :is_active, :boolean, null: false, default: true
      add :master_admin_type, :master_admin_type
      add :commission_percentage, :decimal, precision: 5, scale: 2
      add :volume_margin, :decimal, precision: 15, scale: 2
      add :created_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create unique_index(:users, [:email])
    create index(:users, [:role])
    create index(:users, [:created_by_id])
  end
end
