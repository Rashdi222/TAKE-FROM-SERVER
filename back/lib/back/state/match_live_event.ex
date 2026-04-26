defmodule Back.State.MatchLiveEvent do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "match_live_events" do
    field :provider, :string
    field :provider_event_id, :string
    field :event_seq, :integer
    field :state_version, :integer, default: 0
    field :event_type, :string
    field :severity, :string, default: "minor"
    field :inning, :integer, default: 0
    field :over, :decimal
    field :ball_in_over, :integer, default: 0
    field :event_time, :utc_datetime
    field :source_status, :string
    field :event_side, :string
    field :elapsed_minute, :integer, default: 0
    field :stoppage_minute, :integer, default: 0
    field :home_score, :integer, default: 0
    field :away_score, :integer, default: 0
    field :home_red_cards, :integer, default: 0
    field :away_red_cards, :integer, default: 0
    field :home_corners, :integer, default: 0
    field :away_corners, :integer, default: 0
    field :home_shots_on_target, :integer, default: 0
    field :away_shots_on_target, :integer, default: 0
    field :tempo_index, :decimal
    field :suspension_trigger, :boolean, default: false
    field :processed_at, :utc_datetime
    field :payload, :map, default: %{}

    belongs_to :match, Back.Betting.Match

    timestamps(type: :utc_datetime)
  end

  @type t :: %__MODULE__{
          id: Ecto.UUID.t() | nil,
          provider: String.t() | nil,
          provider_event_id: String.t() | nil,
          event_seq: integer() | nil,
          state_version: integer(),
          event_type: String.t() | nil,
          severity: String.t() | nil,
          inning: integer(),
          over: Decimal.t() | nil,
          ball_in_over: integer(),
          event_time: DateTime.t() | nil,
          source_status: String.t() | nil,
          event_side: String.t() | nil,
          elapsed_minute: integer(),
          stoppage_minute: integer(),
          home_score: integer(),
          away_score: integer(),
          home_red_cards: integer(),
          away_red_cards: integer(),
          home_corners: integer(),
          away_corners: integer(),
          home_shots_on_target: integer(),
          away_shots_on_target: integer(),
          tempo_index: Decimal.t() | nil,
          suspension_trigger: boolean(),
          processed_at: DateTime.t() | nil,
          payload: map()
        }

  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(event, attrs) do
    event
    |> cast(attrs, [
      :match_id,
      :provider,
      :provider_event_id,
      :event_seq,
      :state_version,
      :event_type,
      :severity,
      :inning,
      :over,
      :ball_in_over,
      :event_time,
      :source_status,
      :event_side,
      :elapsed_minute,
      :stoppage_minute,
      :home_score,
      :away_score,
      :home_red_cards,
      :away_red_cards,
      :home_corners,
      :away_corners,
      :home_shots_on_target,
      :away_shots_on_target,
      :tempo_index,
      :suspension_trigger,
      :processed_at,
      :payload
    ])
    |> validate_required([:match_id, :event_seq, :state_version, :event_type])
    |> validate_number(:event_seq, greater_than_or_equal_to: 0)
    |> validate_number(:state_version, greater_than_or_equal_to: 0)
    |> validate_number(:inning, greater_than_or_equal_to: 0)
    |> validate_number(:ball_in_over, greater_than_or_equal_to: 0)
    |> validate_number(:elapsed_minute, greater_than_or_equal_to: 0)
    |> validate_number(:stoppage_minute, greater_than_or_equal_to: 0)
    |> validate_number(:home_score, greater_than_or_equal_to: 0)
    |> validate_number(:away_score, greater_than_or_equal_to: 0)
    |> validate_number(:home_red_cards, greater_than_or_equal_to: 0)
    |> validate_number(:away_red_cards, greater_than_or_equal_to: 0)
    |> validate_number(:home_corners, greater_than_or_equal_to: 0)
    |> validate_number(:away_corners, greater_than_or_equal_to: 0)
    |> validate_number(:home_shots_on_target, greater_than_or_equal_to: 0)
    |> validate_number(:away_shots_on_target, greater_than_or_equal_to: 0)
    |> validate_length(:event_type, max: 120)
    |> validate_length(:severity, max: 32)
    |> validate_length(:event_side, max: 32)
    |> foreign_key_constraint(:match_id)
    |> unique_constraint([:match_id, :event_seq],
      name: :match_live_events_match_id_event_seq_index
    )
    |> unique_constraint([:provider, :provider_event_id],
      name: :match_live_events_provider_event_id_index
    )
    |> check_constraint(:event_seq, name: :match_live_events_event_seq_non_negative)
    |> check_constraint(:state_version, name: :match_live_events_state_version_non_negative)
    |> check_constraint(:inning, name: :match_live_events_inning_non_negative)
    |> check_constraint(:ball_in_over, name: :match_live_events_ball_in_over_non_negative)
  end
end
