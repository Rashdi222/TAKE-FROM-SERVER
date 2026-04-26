defmodule Back.Repo.Migrations.AddCountryCodeToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :country_code, :string
    end

    create index(:users, [:country_code])
  end
end
