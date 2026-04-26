defmodule Back.Repo.Migrations.CreateTransactions do
  use Ecto.Migration

  def change do
    execute(
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN CREATE TYPE transaction_type AS ENUM ('credit','debit','bet_placed','bet_won','bet_lost','transfer','commission','manual_payment'); END IF; END $$;",
      "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN DROP TYPE transaction_type; END IF; END $$;"
    )

    create table(:transactions, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :from_user_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :to_user_id, references(:users, type: :binary_id, on_delete: :restrict), null: false
      add :amount, :decimal, precision: 15, scale: 2, null: false
      add :transaction_type, :transaction_type, null: false
      add :reference_id, :binary_id
      add :description, :text

      timestamps(type: :utc_datetime)
    end

    create index(:transactions, [:from_user_id])
    create index(:transactions, [:to_user_id])
    create index(:transactions, [:transaction_type])
    create index(:transactions, [:reference_id])
  end
end
