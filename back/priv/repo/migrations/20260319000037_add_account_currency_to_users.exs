defmodule Back.Repo.Migrations.AddAccountCurrencyToUsers do
  use Ecto.Migration

  def up do
    alter table(:users) do
      add :account_currency, :string, default: "PKR", null: false
    end

    create index(:users, [:account_currency])
  end

  def down do
    drop index(:users, [:account_currency])

    alter table(:users) do
      remove :account_currency
    end
  end
end
