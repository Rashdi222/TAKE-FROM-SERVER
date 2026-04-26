defmodule Back.SportsData.SportsEvent do
  use Ecto.Schema
  import Ecto.Changeset

  @providers [:api_tennis, :goalserve, :betsapi]
  @sports [:tennis, :horse_racing, :greyhound]
  @statuses [:scheduled, :live, :finished, :cancelled, :unknown]

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "sports_events" do
    field :provider, Ecto.Enum, values: @providers
    field :provider_event_id, :string
    field :sport, Ecto.Enum, values: @sports
    field :competition_name, :string
    field :status, Ecto.Enum, values: @statuses, default: :scheduled
    field :start_time_utc, :utc_datetime
    field :participants, {:array, :map}, default: []
    field :result, :map
    field :raw, :map

    timestamps(type: :utc_datetime)
  end

  def changeset(event, attrs) do
    event
    |> cast(attrs, [
      :provider,
      :provider_event_id,
      :sport,
      :competition_name,
      :status,
      :start_time_utc,
      :participants,
      :result,
      :raw
    ])
    |> validate_required([:provider, :provider_event_id, :sport, :status, :participants, :raw])
    |> validate_length(:provider_event_id, min: 1, max: 255)
    |> validate_participants()
    |> unique_constraint([:provider, :provider_event_id],
      name: :sports_events_provider_provider_event_id_index
    )
  end

  defp validate_participants(changeset) do
    participants = get_field(changeset, :participants) || []

    cond do
      not is_list(participants) ->
        add_error(changeset, :participants, "must be a list")

      Enum.any?(participants, &(not is_map(&1))) ->
        add_error(changeset, :participants, "must contain only maps")

      true ->
        changeset
    end
  end
end
