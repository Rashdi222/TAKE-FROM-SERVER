defmodule BackWeb.SportMarketConfigController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Betting
  alias BackWeb.JsonHelpers

  def index(conn, params) do
    filters =
      []
      |> maybe_filter(:sport, params["sport"])
      |> maybe_filter(:bet_type, params["bet_type"])
      |> maybe_filter(:enabled_only, params["enabled_only"])

    configs = Betting.list_sport_market_configs(filters)
    json(conn, %{data: Enum.map(configs, &config_json/1)})
  end

  def upsert(conn, params) do
    with {:ok, config} <- Betting.upsert_sport_market_config(params) do
      conn
      |> put_status(:created)
      |> json(%{data: config_json(config)})
    end
  end

  defp maybe_filter(filters, :sport, sport)
       when sport in ["cricket", "football", "tennis", "horse_racing", "dog_racing"],
       do: [{:sport, String.to_existing_atom(sport)} | filters]

  defp maybe_filter(filters, :bet_type, bet_type)
       when bet_type in [
              "match_winner",
              "over_under",
              "in_play",
              "double_chance",
              "btts",
              "set_betting",
              "place"
            ],
       do: [{:bet_type, String.to_existing_atom(bet_type)} | filters]

  defp maybe_filter(filters, :enabled_only, enabled) when enabled in ["true", true],
    do: [{:enabled_only, true} | filters]

  defp maybe_filter(filters, _key, _value), do: filters

  defp config_json(config) do
    %{
      id: config.id,
      sport: config.sport,
      bet_type: config.bet_type,
      default_min_odds: JsonHelpers.decimal(config.default_min_odds),
      default_max_odds: JsonHelpers.decimal(config.default_max_odds),
      default_max_stake_amount: JsonHelpers.decimal(config.default_max_stake_amount),
      default_max_payout_amount: JsonHelpers.decimal(config.default_max_payout_amount),
      is_enabled: config.is_enabled,
      inserted_at: config.inserted_at,
      updated_at: config.updated_at
    }
  end
end
