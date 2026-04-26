defmodule Back.Betting.SportMarketConfig do
  use Ecto.Schema
  import Ecto.Changeset

  @sports [:cricket, :tennis, :football, :horse_racing, :dog_racing]
  @bet_types [:match_winner, :over_under, :in_play, :double_chance, :btts, :set_betting, :place]

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "sport_market_configs" do
    field :sport, Ecto.Enum, values: @sports
    field :bet_type, Ecto.Enum, values: @bet_types
    field :default_min_odds, :decimal
    field :default_max_odds, :decimal
    field :default_max_stake_amount, :decimal
    field :default_max_payout_amount, :decimal
    field :is_enabled, :boolean, default: true

    timestamps(type: :utc_datetime)
  end

  def changeset(config, attrs) do
    config
    |> cast(attrs, [
      :sport,
      :bet_type,
      :default_min_odds,
      :default_max_odds,
      :default_max_stake_amount,
      :default_max_payout_amount,
      :is_enabled
    ])
    |> validate_required([:sport, :bet_type, :default_min_odds, :default_max_odds])
    |> validate_number(:default_min_odds, greater_than: 1.0)
    |> validate_number(:default_max_odds, greater_than: 1.0)
    |> validate_number(:default_max_stake_amount, greater_than: 0)
    |> validate_number(:default_max_payout_amount, greater_than: 0)
    |> validate_odd_bounds_order()
    |> validate_inclusion(:sport, @sports)
    |> validate_inclusion(:bet_type, @bet_types)
    |> unique_constraint([:sport, :bet_type], name: :sport_market_configs_sport_bet_type_index)
  end

  defp validate_odd_bounds_order(changeset) do
    min_odds = get_field(changeset, :default_min_odds)
    max_odds = get_field(changeset, :default_max_odds)

    if min_odds && max_odds && Decimal.compare(min_odds, max_odds) in [:gt, :eq] do
      add_error(changeset, :default_max_odds, "must be greater than default_min_odds")
    else
      changeset
    end
  end
end
