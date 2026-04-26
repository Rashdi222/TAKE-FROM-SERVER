defmodule Back.Repo.Migrations.CreatePaymentMethods do
  use Ecto.Migration

  def change do
    execute(
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_provider') THEN CREATE TYPE payment_provider AS ENUM ('easypaisa','manual'); END IF; END $$;",
      "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_provider') THEN DROP TYPE payment_provider; END IF; END $$;"
    )

    create table(:payment_methods, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :provider, :payment_provider, null: false
      add :is_active, :boolean, null: false, default: false
      add :config, :map, null: false, default: %{}
      add :created_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create unique_index(:payment_methods, [:provider])
    create index(:payment_methods, [:is_active])
  end
end
