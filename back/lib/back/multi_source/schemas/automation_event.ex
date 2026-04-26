defmodule Back.MultiSource.Schemas.AutomationEvent do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "multi_source_automation_events" do
    field :event_type, :string
    field :status, :string
    field :source_name, :string
    field :source_match_id, :string
    field :message, :string
    field :metadata, :map, default: %{}

    belongs_to :match, Back.Betting.Match
    belongs_to :canonical_match, Back.MultiSource.Schemas.CanonicalMatch

    timestamps(type: :utc_datetime)
  end

  def changeset(event, attrs) do
    event
    |> cast(attrs, [
      :event_type,
      :status,
      :source_name,
      :source_match_id,
      :match_id,
      :canonical_match_id,
      :message,
      :metadata
    ])
    |> validate_required([:event_type, :status])
    |> foreign_key_constraint(:match_id)
    |> foreign_key_constraint(:canonical_match_id)
  end
end
