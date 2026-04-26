defmodule Back.Repo.Migrations.AddSuspendedMarketsToMatches do
  use Ecto.Migration

  def change do
    alter table(:matches) do
      add :suspended_markets, :map, null: false, default: %{}
    end
  end
end
