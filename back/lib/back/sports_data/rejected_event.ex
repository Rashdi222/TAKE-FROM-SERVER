defmodule Back.SportsData.RejectedEvent do
  use Ecto.Schema
  import Ecto.Changeset

  @providers [:api_tennis, :goalserve, :betsapi]
  @replay_statuses [:pending, :replayed, :failed]

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "sports_data_rejections" do
    field :provider, Ecto.Enum, values: @providers
    field :provider_event_id, :string
    field :source, :string
    field :reason, :string
    field :payload, :map, default: %{}
    field :diagnostics, :map, default: %{}
    field :replay_status, Ecto.Enum, values: @replay_statuses, default: :pending
    field :replayed_at, :utc_datetime

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(rejected_event, attrs) do
    rejected_event
    |> cast(attrs, [
      :provider,
      :provider_event_id,
      :source,
      :reason,
      :payload,
      :diagnostics,
      :replay_status,
      :replayed_at
    ])
    |> validate_required([:source, :reason, :payload])
  end
end
