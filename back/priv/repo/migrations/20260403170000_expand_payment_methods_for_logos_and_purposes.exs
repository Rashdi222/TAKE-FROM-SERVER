defmodule Back.Repo.Migrations.ExpandPaymentMethodsForLogosAndPurposes do
  use Ecto.Migration

  def up do
    drop_if_exists unique_index(:payment_methods, [:created_by_id, :provider])

    alter table(:payment_methods) do
      add :supports_deposit, :boolean, null: false, default: true
      add :supports_withdrawal, :boolean, null: false, default: false
      add :logo_path, :string
      add :preset_key, :string
      add :account_label_hint, :string
      add :account_number_label, :string
      add :account_number_placeholder, :string
      add :instructions_hint, :string
      add :sort_order, :integer, null: false, default: 0
    end

    execute("""
    UPDATE payment_methods
    SET
      supports_deposit = true,
      supports_withdrawal = true,
      account_number_label = 'Account Number',
      account_number_placeholder = COALESCE(NULLIF(iban_or_account_number, ''), 'Enter the destination account number'),
      account_label_hint = COALESCE(NULLIF(account_title, ''), 'Account holder name'),
      instructions_hint = 'Explain exactly how this method should be used and what details the player must provide.'
    """)

    create index(:payment_methods, [:created_by_id, :is_active])
    create index(:payment_methods, [:created_by_id, :supports_deposit])
    create index(:payment_methods, [:created_by_id, :supports_withdrawal])

    create unique_index(:payment_methods, [:created_by_id, :provider, :method_name],
             name: :payment_methods_owner_provider_method_name_index
           )
  end

  def down do
    drop_if_exists unique_index(:payment_methods, [:created_by_id, :provider, :method_name],
                     name: :payment_methods_owner_provider_method_name_index
                   )

    drop_if_exists index(:payment_methods, [:created_by_id, :supports_withdrawal])
    drop_if_exists index(:payment_methods, [:created_by_id, :supports_deposit])
    drop_if_exists index(:payment_methods, [:created_by_id, :is_active])

    alter table(:payment_methods) do
      remove :sort_order
      remove :instructions_hint
      remove :account_number_placeholder
      remove :account_number_label
      remove :account_label_hint
      remove :preset_key
      remove :logo_path
      remove :supports_withdrawal
      remove :supports_deposit
    end

    create unique_index(:payment_methods, [:created_by_id, :provider])
  end
end
