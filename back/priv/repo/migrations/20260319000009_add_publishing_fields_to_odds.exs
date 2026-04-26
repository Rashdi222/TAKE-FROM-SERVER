defmodule Back.Repo.Migrations.AddPublishingFieldsToOdds do
  use Ecto.Migration

  def up do
    execute("""
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'odds_visibility_status') THEN
        CREATE TYPE odds_visibility_status AS ENUM ('draft', 'published', 'archived');
      END IF;
    END$$;
    """)

    alter table(:odds) do
      add :visibility_status, :odds_visibility_status, null: false, default: "draft"
      add :version_no, :integer, null: false, default: 1
      add :admin_note, :text
      add :published_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :published_at, :utc_datetime
    end

    create index(:odds, [:visibility_status])
    create index(:odds, [:match_id, :visibility_status])
  end

  def down do
    drop_if_exists index(:odds, [:match_id, :visibility_status])
    drop_if_exists index(:odds, [:visibility_status])

    alter table(:odds) do
      remove :published_at
      remove :published_by_id
      remove :admin_note
      remove :version_no
      remove :visibility_status
    end

    execute("""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'odds_visibility_status') THEN
        DROP TYPE odds_visibility_status;
      END IF;
    END$$;
    """)
  end
end
