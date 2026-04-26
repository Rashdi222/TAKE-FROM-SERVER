defmodule Back.MultiSource.Schemas.MatchSourceRefreshStatus do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "match_source_refresh_statuses" do
    field :source_name, :string
    field :source_match_id, :string
    field :last_status, :string, default: "idle"
    field :last_requested_at, :utc_datetime
    field :last_completed_at, :utc_datetime
    field :last_message, :string
    field :metadata, :map, default: %{}

    belongs_to :match, Back.Betting.Match

    timestamps(type: :utc_datetime)
  end

  def changeset(status, attrs) do
    status
    |> cast(attrs, [
      :match_id,
      :source_name,
      :source_match_id,
      :last_status,
      :last_requested_at,
      :last_completed_at,
      :last_message,
      :metadata
    ])
    |> validate_required([:match_id, :source_name, :source_match_id, :last_status])
    |> foreign_key_constraint(:match_id)
    |> unique_constraint(:match_id)
  end
end
