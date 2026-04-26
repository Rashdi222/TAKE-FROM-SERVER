defmodule Back.Repo.Migrations.AddSupportedAccountCurrenciesToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :supported_account_currencies, {:array, :string}, default: []
    end
  end
end
