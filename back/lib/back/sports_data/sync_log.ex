defmodule Back.SportsData.SyncLog do
  use Ecto.Schema
  import Ecto.Changeset

  @providers [:api_tennis, :goalserve, :betsapi]
  @statuses [:success, :failure, :partial]

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "sports_data_sync_logs" do
    field :provider, Ecto.Enum, values: @providers
    field :source, :string
    field :status, Ecto.Enum, values: @statuses
    field :fetched_count, :integer, default: 0
    field :upserted_count, :integer, default: 0
    field :failed_count, :integer, default: 0
    field :error, :string
    field :metadata, :map, default: %{}

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(sync_log, attrs) do
    sync_log
    |> cast(attrs, [
      :provider,
      :source,
      :status,
      :fetched_count,
      :upserted_count,
      :failed_count,
      :error,
      :metadata
    ])
    |> validate_required([:provider, :source, :status])
    |> validate_number(:fetched_count, greater_than_or_equal_to: 0)
    |> validate_number(:upserted_count, greater_than_or_equal_to: 0)
    |> validate_number(:failed_count, greater_than_or_equal_to: 0)
  end
end
