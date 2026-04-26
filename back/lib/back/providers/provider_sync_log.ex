defmodule Back.Providers.ProviderSyncLog do
  use Ecto.Schema
  import Ecto.Changeset

  @sync_types ["scheduled", "manual", "retry"]
  @statuses [:success, :failure, :partial]

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "provider_sync_logs" do
    belongs_to :provider, Back.Providers.Provider
    field :sync_type, :string
    field :status, Ecto.Enum, values: @statuses
    field :error, :string
    field :duration_ms, :integer
    field :metadata, :map

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(sync_log, attrs) do
    sync_log
    |> cast(attrs, [:provider_id, :sync_type, :status, :error, :duration_ms, :metadata])
    |> validate_required([:provider_id, :sync_type, :status])
    |> validate_inclusion(:sync_type, @sync_types)
    |> validate_number(:duration_ms, greater_than_or_equal_to: 0)
    |> foreign_key_constraint(:provider_id)
  end
end
