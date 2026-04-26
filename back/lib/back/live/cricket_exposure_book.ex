defmodule Back.Live.CricketExposureBook do
  @moduledoc false

  import Ecto.Query

  alias Back.Betting.Bet
  alias Back.Repo

  @spec build(Ecto.UUID.t()) :: map()
  def build(match_id) when is_binary(match_id) do
    selection_rows =
      Repo.all(
        from b in Bet,
          where: b.match_id == ^match_id and b.status == :pending,
          group_by: [b.market_key, b.selection_key],
          select: %{
            market_key: b.market_key,
            selection_key: b.selection_key,
            stake_total: coalesce(sum(b.stake), 0),
            potential_payout: coalesce(sum(b.potential_win), 0),
            bet_count: count(b.id),
            distinct_users: count(fragment("distinct ?", b.user_id))
          }
      )

    user_rows =
      Repo.all(
        from b in Bet,
          where: b.match_id == ^match_id and b.status == :pending,
          group_by: [b.market_key, b.selection_key, b.user_id],
          select: %{
            market_key: b.market_key,
            selection_key: b.selection_key,
            user_potential: coalesce(sum(b.potential_win), 0)
          }
      )

    user_max_by_selection =
      Enum.reduce(user_rows, %{}, fn row, acc ->
        key = {row.market_key || "unknown", row.selection_key || "unknown"}
        current = Map.get(acc, key)

        if is_nil(current) or Decimal.compare(row.user_potential, current) == :gt do
          Map.put(acc, key, row.user_potential)
        else
          acc
        end
      end)

    markets =
      Enum.reduce(selection_rows, %{}, fn row, acc ->
        market_key = row.market_key || "unknown"
        selection_key = row.selection_key || "unknown"

        max_user_potential =
          Map.get(user_max_by_selection, {market_key, selection_key}, Decimal.new("0"))

        selection_summary = %{
          "stake_total" => decimal(max_user_potentialize(row.stake_total)),
          "potential_payout" => decimal(max_user_potentialize(row.potential_payout)),
          "bet_count" => row.bet_count,
          "distinct_users" => row.distinct_users,
          "max_user_potential" => decimal(max_user_potential)
        }

        update_in(
          acc,
          [market_key, Access.key("selections", %{})],
          fn selections -> Map.put(selections || %{}, selection_key, selection_summary) end
        )
      end)

    summary = %{
      "pending_bet_count" => Enum.reduce(selection_rows, 0, &(&1.bet_count + &2)),
      "total_pending_stake" => decimal(sum_decimals(selection_rows, :stake_total)),
      "total_pending_potential_payout" => decimal(sum_decimals(selection_rows, :potential_payout))
    }

    %{
      "summary" => summary,
      "policy" => %{
        "selection_soft_share" => 0.58,
        "selection_hard_share" => 0.68,
        "max_probability_shade" => 0.04,
        "high_user_concentration_ratio" => 0.45
      },
      "markets" => markets
    }
  end

  defp sum_decimals(rows, field) do
    Enum.reduce(rows, Decimal.new("0"), fn row, acc ->
      Decimal.add(acc, max_user_potentialize(Map.get(row, field)))
    end)
  end

  defp decimal(value) when is_nil(value), do: nil
  defp decimal(%Decimal{} = value), do: Decimal.to_string(value, :normal)
  defp decimal(value) when is_integer(value), do: Integer.to_string(value)

  defp max_user_potentialize(%Decimal{} = value), do: value
  defp max_user_potentialize(value) when is_integer(value), do: Decimal.new(value)
  defp max_user_potentialize(value) when is_float(value), do: Decimal.from_float(value)
  defp max_user_potentialize(value), do: Decimal.new(to_string(value))
end
