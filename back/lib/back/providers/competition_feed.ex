defmodule Back.Providers.CompetitionFeed do
  use Ecto.Schema
  import Ecto.Changeset

  @sports ~w(cricket football tennis horse_racing dog_racing)
  @import_modes ~w(season date_window region track tournament)

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "competition_feeds" do
    field :name, :string
    field :sport, :string
    field :competition_key, :string
    field :league_id, :string
    field :season_id, :string
    field :region, :string
    field :track, :string
    field :import_mode, :string, default: "season"
    field :enabled, :boolean, default: true
    field :live_sync_enabled, :boolean, default: true
    field :import_provider_odds, :boolean, default: false
    field :generate_platform_odds, :boolean, default: true
    field :upcoming_window_days, :integer, default: 7
    field :live_start_offset_minutes, :integer, default: 30
    field :live_poll_interval_seconds, :integer, default: 30
    field :live_stop_offset_minutes, :integer, default: 15
    field :config, :map, default: %{}

    belongs_to :provider, Back.Providers.Provider

    timestamps(type: :utc_datetime)
  end

  def changeset(feed, attrs) do
    feed
    |> cast(attrs, [
      :name,
      :sport,
      :competition_key,
      :league_id,
      :season_id,
      :region,
      :track,
      :import_mode,
      :enabled,
      :live_sync_enabled,
      :import_provider_odds,
      :generate_platform_odds,
      :upcoming_window_days,
      :live_start_offset_minutes,
      :live_poll_interval_seconds,
      :live_stop_offset_minutes,
      :config,
      :provider_id
    ])
    |> validate_required([:name, :sport, :competition_key, :import_mode, :provider_id])
    |> validate_inclusion(:sport, @sports)
    |> validate_inclusion(:import_mode, @import_modes)
    |> validate_number(:upcoming_window_days, greater_than_or_equal_to: 0)
    |> validate_number(:live_start_offset_minutes, greater_than_or_equal_to: 0)
    |> validate_number(:live_poll_interval_seconds, greater_than: 0)
    |> validate_number(:live_stop_offset_minutes, greater_than_or_equal_to: 0)
    |> validate_length(:name, min: 2, max: 120)
    |> validate_length(:competition_key, min: 2, max: 120)
    |> unique_constraint([:provider_id, :competition_key, :season_id],
      name: :competition_feeds_provider_id_competition_key_season_id_index
    )
    |> foreign_key_constraint(:provider_id)
  end
end
