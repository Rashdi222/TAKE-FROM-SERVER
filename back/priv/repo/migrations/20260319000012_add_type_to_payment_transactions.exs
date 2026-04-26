defmodule Back.Repo.Migrations.AddTypeToPaymentTransactions do
  use Ecto.Migration

  def change do
    alter table(:payment_transactions) do
      add :type, :string, null: false, default: "deposit"
    end

    create index(:payment_transactions, [:type])
  end
end
