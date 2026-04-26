defmodule Back.Repo.Migrations.AddWalletVersionToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :wallet_version, :integer, null: false, default: 0
      add :last_balance_changed_at, :utc_datetime
    end

    create constraint(:users, :users_wallet_version_non_negative, check: "wallet_version >= 0")
  end
end
