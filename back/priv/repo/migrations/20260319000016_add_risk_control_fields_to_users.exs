defmodule Back.Repo.Migrations.AddRiskControlFieldsToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :max_stake_per_bet, :decimal
      add :daily_max_exposure, :decimal
      add :betting_locked, :boolean, null: false, default: false
      add :payments_locked, :boolean, null: false, default: false
      add :session_revoked_at, :utc_datetime
    end

    create index(:users, [:betting_locked])
    create index(:users, [:payments_locked])
  end
end
