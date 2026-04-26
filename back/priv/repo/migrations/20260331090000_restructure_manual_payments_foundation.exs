defmodule Back.Repo.Migrations.RestructureManualPaymentsFoundation do
  use Ecto.Migration

  def up do
    drop_if_exists unique_index(:payment_methods, [:provider])
    execute("ALTER TABLE payment_methods ALTER COLUMN provider TYPE varchar USING provider::text")

    alter table(:payment_methods) do
      add :method_name, :string
      add :bank_name, :string
      add :account_title, :string
      add :iban_or_account_number, :string
      add :instructions, :text
      add :updated_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
    end

    execute("""
    UPDATE payment_methods
    SET
      method_name = COALESCE(config->>'label', INITCAP(REPLACE(provider, '_', ' '))),
      bank_name = NULLIF(config->>'bank_name', ''),
      account_title = NULLIF(config->>'account_label', ''),
      iban_or_account_number = COALESCE(NULLIF(config->>'iban_or_account_number', ''), NULLIF(config->>'iban', ''), NULLIF(config->>'account_number', '')),
      instructions = COALESCE(NULLIF(config->>'instructions', ''), instructions)
    """)

    execute("""
    UPDATE payment_methods
    SET created_by_id = (
      SELECT id FROM users WHERE role = 'super_admin' ORDER BY inserted_at ASC LIMIT 1
    )
    WHERE created_by_id IS NULL
    """)

    execute(
      "UPDATE payment_methods SET method_name = INITCAP(REPLACE(provider, '_', ' ')) WHERE method_name IS NULL OR method_name = ''"
    )

    alter table(:payment_methods) do
      remove :config
      modify :provider, :string, null: false
      modify :method_name, :string, null: false
      modify :created_by_id, :binary_id, null: false
    end

    alter table(:payment_transactions) do
      add :approval_owner_id, references(:users, type: :binary_id, on_delete: :restrict)
      add :reviewed_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :reviewed_at, :utc_datetime
      add :receipt_path, :string
    end

    execute("""
    UPDATE payment_transactions AS pt
    SET approval_owner_id = COALESCE(
      u.created_by_id,
      (
        SELECT id FROM users WHERE role = 'super_admin' ORDER BY inserted_at ASC LIMIT 1
      )
    )
    FROM users AS u
    WHERE pt.user_id = u.id AND pt.approval_owner_id IS NULL
    """)

    alter table(:payment_transactions) do
      modify :approval_owner_id, :binary_id, null: false
    end

    create index(:payment_methods, [:created_by_id])
    create unique_index(:payment_methods, [:created_by_id, :provider])
    create index(:payment_transactions, [:approval_owner_id])
    create index(:payment_transactions, [:reviewed_by_id])
    create index(:payment_transactions, [:type, :status])
  end

  def down do
    drop_if_exists unique_index(:payment_methods, [:created_by_id, :provider])
    drop_if_exists index(:payment_transactions, [:type, :status])
    drop_if_exists index(:payment_transactions, [:reviewed_by_id])
    drop_if_exists index(:payment_transactions, [:approval_owner_id])
    drop_if_exists index(:payment_methods, [:created_by_id])

    alter table(:payment_transactions) do
      remove :receipt_path
      remove :reviewed_at
      remove :reviewed_by_id
      remove :approval_owner_id
    end

    alter table(:payment_methods) do
      add :config, :map, null: false, default: %{}
    end

    execute("""
    UPDATE payment_methods
    SET config = jsonb_strip_nulls(jsonb_build_object(
      'label', method_name,
      'instructions', instructions,
      'account_label', account_title,
      'account_number', iban_or_account_number,
      'bank_name', bank_name
    ))
    """)

    alter table(:payment_methods) do
      remove :updated_by_id
      remove :instructions
      remove :iban_or_account_number
      remove :account_title
      remove :bank_name
      remove :method_name
      modify :provider, :payment_provider, using: "provider::payment_provider", null: false
      modify :created_by_id, :binary_id, null: true
    end

    create unique_index(:payment_methods, [:provider])
  end
end
