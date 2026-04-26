defmodule Back.Repo.Migrations.CreatePaymentTransactions do
  use Ecto.Migration

  def change do
    execute(
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN CREATE TYPE payment_status AS ENUM ('pending','completed','failed','cancelled'); END IF; END $$;",
      "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN DROP TYPE payment_status; END IF; END $$;"
    )

    create table(:payment_transactions, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :restrict), null: false

      add :payment_method_id,
          references(:payment_methods, type: :binary_id, on_delete: :nilify_all)

      add :transaction_id, references(:transactions, type: :binary_id, on_delete: :nilify_all)
      add :amount, :decimal, precision: 15, scale: 2, null: false
      add :status, :payment_status, null: false, default: "pending"
      add :provider_transaction_id, :string
      add :provider_response, :map

      timestamps(type: :utc_datetime)
    end

    create index(:payment_transactions, [:user_id])
    create index(:payment_transactions, [:payment_method_id])
    create index(:payment_transactions, [:status])
    create index(:payment_transactions, [:provider_transaction_id])
  end
end
