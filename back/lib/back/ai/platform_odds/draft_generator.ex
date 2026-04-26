defmodule Back.AI.PlatformOdds.DraftGenerator do
  @moduledoc false

  alias Back.AI.OddsGenerator
  alias Back.Betting
  alias Back.Betting.InPlaySnapshot
  alias Back.Betting.Match

  def generate_for_match(%Match{} = match, bet_types, opts \\ []) when is_list(bet_types) do
    version_no = Betting.next_odds_version(match.id)
    admin_note = Keyword.get(opts, :admin_note)
    generation_opts = Keyword.take(opts, [:hardness, :model, :admin_note])
    defaults = Keyword.get(opts, :defaults, %{})

    with {:ok, generated_odds} <- OddsGenerator.generate_odds(match, bet_types, generation_opts) do
      inserted = persist_generated_odds(generated_odds, match, version_no, admin_note, defaults)

      if inserted == [] do
        {:error, :no_valid_odds_returned}
      else
        {:ok, %{version_no: version_no, count: length(inserted), odds: inserted}}
      end
    end
  end

  defp persist_generated_odds(generated_odds, match, version_no, admin_note, defaults) do
    request_defaults = normalize_defaults(defaults)

    Enum.map(generated_odds, fn o ->
      resolved_limits = resolve_limits_for_odds(match, o, request_defaults)

      attrs = %{
        "match_id" => match.id,
        "bet_type" => to_string(o.bet_type),
        "outcome" => o.outcome,
        "odds_value" => o.odds_value,
        "ai_generated" => true,
        "ai_model" => o.ai_model,
        "visibility_status" => "draft",
        "version_no" => version_no,
        "admin_note" => admin_note,
        "published_by_id" => nil,
        "published_at" => nil,
        "provider_snapshot" => in_play_snapshot(match, o.bet_type),
        "max_stake_amount" => resolved_limits.max_stake_amount,
        "max_payout_amount" => resolved_limits.max_payout_amount,
        "limit_scope" => resolved_limits.limit_scope
      }

      case Betting.create_odds(attrs) do
        {:ok, odds} -> odds
        _ -> nil
      end
    end)
    |> Enum.reject(&is_nil/1)
  end

  defp normalize_defaults(defaults) when is_map(defaults) do
    %{
      max_stake_amount: defaults[:max_stake_amount] || defaults["max_stake_amount"],
      max_payout_amount: defaults[:max_payout_amount] || defaults["max_payout_amount"],
      limit_scope: defaults[:limit_scope] || defaults["limit_scope"] || "market",
      market_limits: parse_market_limits(defaults[:market_limits] || defaults["market_limits"])
    }
  end

  defp normalize_defaults(_),
    do: %{max_stake_amount: nil, max_payout_amount: nil, limit_scope: "market", market_limits: []}

  defp in_play_snapshot(match, :in_play), do: InPlaySnapshot.build(match, :in_play)
  defp in_play_snapshot(_match, _bet_type), do: nil

  defp resolve_limits_for_odds(match, generated_odd, defaults) do
    bet_type = generated_odd.bet_type
    outcome = generated_odd.outcome
    market_config = Betting.get_sport_market_config(match.sport, bet_type)

    override = find_market_limit_override(defaults.market_limits || [], bet_type, outcome)

    max_stake_amount =
      choose_limit(
        override && override.max_stake_amount,
        defaults.max_stake_amount,
        market_config && market_config.default_max_stake_amount
      )

    max_payout_amount =
      choose_limit(
        override && override.max_payout_amount,
        defaults.max_payout_amount,
        market_config && market_config.default_max_payout_amount
      )

    limit_scope =
      normalize_scope((override && override.limit_scope) || defaults.limit_scope || "market")

    %{
      max_stake_amount: max_stake_amount,
      max_payout_amount: max_payout_amount,
      limit_scope: limit_scope
    }
  end

  defp choose_limit(override, request_default, market_default),
    do: override || request_default || market_default

  defp parse_market_limits(nil), do: []
  defp parse_market_limits(""), do: []

  defp parse_market_limits(v) when is_binary(v) do
    case Jason.decode(v) do
      {:ok, decoded} -> parse_market_limits(decoded)
      _ -> []
    end
  end

  defp parse_market_limits(v) when is_list(v) do
    v
    |> Enum.filter(&is_map/1)
    |> Enum.map(fn item ->
      %{
        bet_type: parse_bet_type(item["bet_type"] || item[:bet_type]),
        outcome: normalize_outcome(item["outcome"] || item[:outcome]),
        max_stake_amount: item["max_stake_amount"] || item[:max_stake_amount],
        max_payout_amount: item["max_payout_amount"] || item[:max_payout_amount],
        limit_scope: item["limit_scope"] || item[:limit_scope]
      }
    end)
    |> Enum.filter(& &1.bet_type)
  end

  defp parse_market_limits(_), do: []

  defp find_market_limit_override(market_limits, bet_type, outcome) do
    normalized_outcome = normalize_outcome(outcome)

    exact =
      Enum.find(market_limits, fn row ->
        row.bet_type == bet_type and row.outcome not in [nil, ""] and
          row.outcome == normalized_outcome
      end)

    exact ||
      Enum.find(market_limits, fn row ->
        row.bet_type == bet_type and row.outcome in [nil, ""]
      end)
  end

  defp normalize_scope(v) when v in [:global, :market, :selection], do: v
  defp normalize_scope("global"), do: :global
  defp normalize_scope("selection"), do: :selection
  defp normalize_scope(_), do: :market

  defp normalize_outcome(nil), do: nil

  defp normalize_outcome(v) do
    v
    |> to_string()
    |> String.trim()
    |> String.downcase()
    |> String.replace(" ", "_")
  end

  defp parse_bet_type(v)
       when v in [
              :match_winner,
              :over_under,
              :in_play,
              :double_chance,
              :btts,
              :set_betting,
              :place
            ],
       do: v

  defp parse_bet_type("match_winner"), do: :match_winner
  defp parse_bet_type("over_under"), do: :over_under
  defp parse_bet_type("in_play"), do: :in_play
  defp parse_bet_type("double_chance"), do: :double_chance
  defp parse_bet_type("btts"), do: :btts
  defp parse_bet_type("set_betting"), do: :set_betting
  defp parse_bet_type("place"), do: :place
  defp parse_bet_type(_), do: nil
end
