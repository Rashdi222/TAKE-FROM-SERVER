defmodule Back.Betting.Match do
  use Ecto.Schema
  import Ecto.Changeset

  alias Back.Betting.MatchSlug

  @sports [:cricket, :tennis, :football, :horse_racing, :dog_racing]
  @statuses [:upcoming, :live, :closed, :settled, :cancelled]

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "matches" do
    field :sport, Ecto.Enum, values: @sports
    field :team1, :string
    field :team2, :string
    field :start_time, :utc_datetime
    field :status, Ecto.Enum, values: @statuses, default: :upcoming
    field :winner, :string
    field :in_play_enabled, :boolean, default: false
    field :external_id, :string
    field :provider, :string
    field :slug, :string
    field :score, :map, default: %{}
    field :raw_data, :map, default: %{}
    field :live_state_version, :integer, default: 0
    field :live_event_seq, :integer, default: 0
    field :current_innings, :integer, default: 0
    field :current_over, :decimal
    field :current_ball_in_over, :integer, default: 0
    field :batting_team, :string
    field :bowling_team, :string
    field :runs_total, :integer, default: 0
    field :wickets_total, :integer, default: 0
    field :target_runs, :integer
    field :required_run_rate, :decimal
    field :current_run_rate, :decimal
    field :momentum_index, :decimal
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
    field :market_state, :map, default: %{}
    field :suspended_markets, :map, default: %{}
    field :last_ball_event_type, :string
    field :last_live_event_at, :utc_datetime
    field :suspended_at, :utc_datetime
    field :suspension_reason, :string

    belongs_to :created_by, Back.Accounts.User
    belongs_to :competition_feed, Back.Providers.CompetitionFeed
    has_many :odds, Back.Betting.Odds
    has_many :bets, Back.Betting.Bet
    has_many :live_events, Back.State.MatchLiveEvent

    timestamps(type: :utc_datetime)
  end

  @type t :: %__MODULE__{
          id: Ecto.UUID.t() | nil,
          sport: atom() | nil,
          team1: String.t() | nil,
          team2: String.t() | nil,
          start_time: DateTime.t() | nil,
          status: atom() | nil,
          winner: String.t() | nil,
          in_play_enabled: boolean(),
          external_id: String.t() | nil,
          provider: String.t() | nil,
          slug: String.t() | nil,
          score: map(),
          raw_data: map(),
          live_state_version: integer(),
          live_event_seq: integer(),
          current_innings: integer(),
          current_over: Decimal.t() | nil,
          current_ball_in_over: integer(),
          batting_team: String.t() | nil,
          bowling_team: String.t() | nil,
          runs_total: integer(),
          wickets_total: integer(),
          target_runs: integer() | nil,
          required_run_rate: Decimal.t() | nil,
          current_run_rate: Decimal.t() | nil,
          momentum_index: Decimal.t() | nil,
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
          market_state: map(),
          suspended_markets: map(),
          last_ball_event_type: String.t() | nil,
          last_live_event_at: DateTime.t() | nil,
          suspended_at: DateTime.t() | nil,
          suspension_reason: String.t() | nil
        }

  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(match, attrs) do
    match
    |> cast(attrs, base_fields())
    |> sanitize_json_fields()
    |> validate_required([:sport, :team1, :team2, :start_time])
    |> validate_inclusion(:sport, @sports)
    |> validate_inclusion(:status, @statuses)
    |> validate_different_teams()
    |> validate_live_state_fields()
    |> MatchSlug.put_slug()
    |> unique_constraint([:provider, :external_id], name: :matches_provider_external_id_index)
    |> check_constraint(:live_state_version, name: :matches_live_state_version_non_negative)
    |> check_constraint(:live_event_seq, name: :matches_live_event_seq_non_negative)
    |> check_constraint(:current_innings, name: :matches_current_innings_non_negative)
    |> check_constraint(:current_ball_in_over, name: :matches_current_ball_in_over_non_negative)
    |> check_constraint(:runs_total, name: :matches_runs_total_non_negative)
    |> check_constraint(:wickets_total, name: :matches_wickets_total_non_negative)
    |> check_constraint(:target_runs, name: :matches_target_runs_non_negative)
  end

  @spec live_state_changeset(t(), map()) :: Ecto.Changeset.t()
  def live_state_changeset(match, attrs) do
    match
    |> cast(attrs, live_state_fields())
    |> sanitize_json_fields()
    |> validate_live_state_fields()
    |> check_constraint(:live_state_version, name: :matches_live_state_version_non_negative)
    |> check_constraint(:live_event_seq, name: :matches_live_event_seq_non_negative)
    |> check_constraint(:current_innings, name: :matches_current_innings_non_negative)
    |> check_constraint(:current_ball_in_over, name: :matches_current_ball_in_over_non_negative)
    |> check_constraint(:runs_total, name: :matches_runs_total_non_negative)
    |> check_constraint(:wickets_total, name: :matches_wickets_total_non_negative)
    |> check_constraint(:target_runs, name: :matches_target_runs_non_negative)
  end

  @spec settle_changeset(t(), String.t()) :: Ecto.Changeset.t()
  def settle_changeset(match, winner) do
    match
    |> change(winner: winner, status: :settled)
    |> validate_required([:winner])
  end

  defp base_fields do
    [
      :sport,
      :team1,
      :team2,
      :start_time,
      :status,
      :winner,
      :in_play_enabled,
      :created_by_id,
      :external_id,
      :provider,
      :slug,
      :competition_feed_id,
      :score,
      :raw_data
    ] ++ live_state_fields()
  end

  defp live_state_fields do
    [
      :score,
      :raw_data,
      :status,
      :in_play_enabled,
      :live_state_version,
      :live_event_seq,
      :current_innings,
      :current_over,
      :current_ball_in_over,
      :batting_team,
      :bowling_team,
      :runs_total,
      :wickets_total,
      :target_runs,
      :required_run_rate,
      :current_run_rate,
      :momentum_index,
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
      :market_state,
      :suspended_markets,
      :last_ball_event_type,
      :last_live_event_at,
      :suspended_at,
      :suspension_reason
    ]
  end

  defp validate_different_teams(changeset) do
    team1 = get_field(changeset, :team1)
    team2 = get_field(changeset, :team2)

    if team1 && team2 && team1 == team2 do
      add_error(changeset, :team2, "must be different from team1")
    else
      changeset
    end
  end

  defp sanitize_json_fields(changeset) do
    Enum.reduce([:score, :raw_data, :market_state, :suspended_markets], changeset, fn field,
                                                                                      acc ->
      update_change(acc, field, &json_safe/1)
    end)
  end

  defp json_safe(%Decimal{} = value), do: Decimal.to_string(value, :normal)
  defp json_safe(%DateTime{} = value), do: DateTime.to_iso8601(value)
  defp json_safe(%NaiveDateTime{} = value), do: NaiveDateTime.to_iso8601(value)
  defp json_safe(%Date{} = value), do: Date.to_iso8601(value)
  defp json_safe(%Time{} = value), do: Time.to_iso8601(value)

  defp json_safe(%_{} = value) do
    value
    |> Map.from_struct()
    |> json_safe()
  end

  defp json_safe(value) when is_map(value) do
    Map.new(value, fn {key, nested_value} ->
      {key, json_safe(nested_value)}
    end)
  end

  defp json_safe(value) when is_list(value), do: Enum.map(value, &json_safe/1)
  defp json_safe(value) when is_integer(value) or is_float(value) or is_boolean(value), do: value
  defp json_safe(value) when is_binary(value), do: value
  defp json_safe(value) when is_atom(value), do: Atom.to_string(value)
  defp json_safe(nil), do: nil
  defp json_safe(_), do: %{}

  defp validate_live_state_fields(changeset) do
    changeset
    |> validate_number(:live_state_version, greater_than_or_equal_to: 0)
    |> validate_number(:live_event_seq, greater_than_or_equal_to: 0)
    |> validate_number(:current_innings, greater_than_or_equal_to: 0)
    |> validate_number(:current_ball_in_over, greater_than_or_equal_to: 0)
    |> validate_number(:runs_total, greater_than_or_equal_to: 0)
    |> validate_number(:wickets_total, greater_than_or_equal_to: 0)
    |> validate_number(:target_runs, greater_than_or_equal_to: 0)
    |> validate_number(:required_run_rate, greater_than_or_equal_to: 0)
    |> validate_number(:current_run_rate, greater_than_or_equal_to: 0)
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
    |> validate_length(:last_ball_event_type, max: 120)
    |> validate_length(:suspension_reason, max: 255)
  end
end
