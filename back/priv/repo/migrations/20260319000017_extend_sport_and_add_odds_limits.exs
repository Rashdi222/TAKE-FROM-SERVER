defmodule Back.Repo.Migrations.ExtendSportAndAddOddsLimits do
  use Ecto.Migration

  def up do
    execute("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'sport_type' AND e.enumlabel = 'football'
      ) THEN
        ALTER TYPE sport_type ADD VALUE 'football';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'sport_type' AND e.enumlabel = 'horse_racing'
      ) THEN
        ALTER TYPE sport_type ADD VALUE 'horse_racing';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'sport_type' AND e.enumlabel = 'dog_racing'
      ) THEN
        ALTER TYPE sport_type ADD VALUE 'dog_racing';
      END IF;
    END$$;
    """)

    execute("""
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'odds_limit_scope') THEN
        CREATE TYPE odds_limit_scope AS ENUM ('global', 'market', 'selection');
      END IF;
    END$$;
    """)

    alter table(:odds) do
      add :max_stake_amount, :decimal, precision: 18, scale: 2
      add :max_payout_amount, :decimal, precision: 18, scale: 2
      add :limit_scope, :odds_limit_scope, null: false, default: "market"
    end

    create index(:odds, [:limit_scope])
  end

  def down do
    drop_if_exists index(:odds, [:limit_scope])

    alter table(:odds) do
      remove :limit_scope
      remove :max_payout_amount
      remove :max_stake_amount
    end

    execute("""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'odds_limit_scope') THEN
        DROP TYPE odds_limit_scope;
      END IF;
    END$$;
    """)

    # Intentionally not removing values from sport_type enum.
    # PostgreSQL enum value removal is not safely reversible in production.
  end
end
