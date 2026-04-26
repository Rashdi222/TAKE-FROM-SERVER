defmodule Back.Repo.Migrations.ExtendBetTypeForFootballMarkets do
  use Ecto.Migration

  def up do
    execute("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'bet_type' AND e.enumlabel = 'double_chance'
      ) THEN
        ALTER TYPE bet_type ADD VALUE 'double_chance';
      END IF;
    END $$;
    """)

    execute("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'bet_type' AND e.enumlabel = 'btts'
      ) THEN
        ALTER TYPE bet_type ADD VALUE 'btts';
      END IF;
    END $$;
    """)
  end

  def down do
    raise "irreversible migration: PostgreSQL enum values cannot be safely removed"
  end
end
