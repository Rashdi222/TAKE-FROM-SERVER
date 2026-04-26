defmodule Back.Repo.Migrations.AddMemberFieldsToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :username, :string
      add :phone_number, :string
    end

    create unique_index(:users, [:username], where: "username IS NOT NULL")
    create index(:users, [:phone_number])
  end
end
