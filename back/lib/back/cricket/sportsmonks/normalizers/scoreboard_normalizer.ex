defmodule Back.Cricket.Sportsmonks.Normalizers.ScoreboardNormalizer do
  @moduledoc false

  alias Decimal, as: D

  @spec normalize(map()) :: map()
  def normalize(raw) when is_map(raw) do
    scoreboards = List.wrap(raw["scoreboards"])
    runs = List.wrap(raw["runs"])
    balls = List.wrap(raw["balls"])

    current_scoreboard = pick_current_scoreboard(scoreboards, runs, balls)

    scoreboard_code =
      current_scoreboard["type"] || current_scoreboard["scoreboard"] ||
        inning_to_scoreboard(current_scoreboard["inning"])

    inning = scoreboard_inning(scoreboard_code)
    active_runs = Enum.find(runs, %{}, fn entry -> integer_or_zero(entry["inning"]) == inning end)

    %{
      "scoreboards" =>
        Enum.map(scoreboards, fn board ->
          %{
            "id" => board["id"],
            "type" => board["type"] || board["scoreboard"],
            "inning" => integer_or_zero(board["inning"]),
            "title" => present_string(board["title"] || board["name"])
          }
          |> Enum.reject(fn {_key, value} -> is_nil(value) end)
          |> Map.new()
        end),
      "current_scoreboard" => %{
        "type" => scoreboard_code,
        "inning" => inning,
        "current_run_rate" => decimal_or_string(resolve_crr(active_runs, balls, scoreboard_code)),
        "required_run_rate" => decimal_or_string(resolve_rrr(raw, runs, inning, active_runs)),
        "ball_feed" => build_ball_feed(balls, scoreboard_code)
      }
    }
  end

  def normalize(_), do: normalize(%{})

  defp pick_current_scoreboard(scoreboards, runs, balls) do
    Enum.find(scoreboards, %{}, fn board -> truthy?(board["active"]) end) ||
      latest_scoreboard_from_balls(balls) ||
      latest_scoreboard_from_runs(runs) ||
      List.last(scoreboards) ||
      %{"type" => "S1", "inning" => 1}
  end

  defp latest_scoreboard_from_balls(balls) do
    balls
    |> Enum.sort_by(&ball_sort_key/1)
    |> List.last()
    |> case do
      %{} = latest ->
        %{"type" => latest["scoreboard"], "inning" => scoreboard_inning(latest["scoreboard"])}

      _ ->
        nil
    end
  end

  defp latest_scoreboard_from_runs(runs) do
    case Enum.max_by(runs, &integer_or_zero(&1["inning"]), fn -> nil end) do
      nil ->
        nil

      %{} = latest ->
        %{
          "type" => inning_to_scoreboard(latest["inning"]),
          "inning" => integer_or_zero(latest["inning"])
        }
    end
  end

  defp resolve_crr(active_runs, balls, scoreboard_code) do
    overs = normalize_decimal(active_runs["overs"] || latest_ball_value(balls, scoreboard_code))
    runs = integer_or_zero(active_runs["score"])

    with %D{} = overs <- overs,
         :gt <- D.compare(overs, D.new(0)) do
      D.div(D.new(runs), overs) |> D.round(3)
    else
      _ -> nil
    end
  end

  defp resolve_rrr(_raw, _runs, inning, _active_runs) when inning <= 1, do: nil

  defp resolve_rrr(raw, runs, inning, active_runs) do
    previous =
      Enum.find(runs, %{}, fn entry -> integer_or_zero(entry["inning"]) == inning - 1 end)

    target = integer_or_zero(previous["score"]) + 1
    current = integer_or_zero(active_runs["score"])

    overs_limit =
      integer_or_zero(raw["overs"] || raw["total_overs"] || raw["scheduled_overs"] || 20)

    current_over = normalize_decimal(active_runs["overs"])

    with target when target > current <- target,
         overs_limit when overs_limit > 0 <- overs_limit,
         %D{} = current_over <- current_over,
         remaining_overs <- D.sub(D.new(overs_limit), current_over),
         :gt <- D.compare(remaining_overs, D.new(0)) do
      D.div(D.new(target - current), remaining_overs) |> D.round(3)
    else
      _ -> nil
    end
  end

  defp build_ball_feed(balls, scoreboard_code) do
    balls
    |> List.wrap()
    |> Enum.filter(fn ball -> ball["scoreboard"] == scoreboard_code end)
    |> Enum.sort_by(&ball_sort_key/1)
    |> Enum.take(-18)
    |> Enum.map(fn ball ->
      score = ball["score"] || %{}

      %{
        "id" => ball["id"],
        "over" => ball["ball"],
        "batsman" =>
          present_string(
            get_in(ball, ["batsman", "fullname"]) || get_in(ball, ["batsman", "name"])
          ),
        "bowler" =>
          present_string(get_in(ball, ["bowler", "fullname"]) || get_in(ball, ["bowler", "name"])),
        "runs" => integer_or_zero(score["runs"]),
        "label" => ball_label(score),
        "is_wicket" => truthy?(score["is_wicket"]) or truthy?(score["out"]),
        "is_boundary" => truthy?(score["four"]) or truthy?(score["six"])
      }
      |> Enum.reject(fn {_key, value} -> is_nil(value) end)
      |> Map.new()
    end)
  end

  defp latest_ball_value(balls, scoreboard_code) do
    balls
    |> List.wrap()
    |> Enum.filter(fn ball -> ball["scoreboard"] == scoreboard_code end)
    |> Enum.sort_by(&ball_sort_key/1)
    |> List.last()
    |> case do
      %{} = latest -> latest["ball"]
      _ -> nil
    end
  end

  defp ball_label(score) do
    cond do
      truthy?(score["is_wicket"]) or truthy?(score["out"]) -> "W"
      truthy?(score["six"]) -> "6"
      truthy?(score["four"]) -> "4"
      true -> Integer.to_string(integer_or_zero(score["runs"]))
    end
  end

  defp ball_sort_key(ball) do
    case ball["ball"] do
      value when is_integer(value) ->
        value * 10

      value when is_float(value) ->
        round(value * 10)

      value when is_binary(value) ->
        case Float.parse(String.trim(value)) do
          {parsed, _} -> round(parsed * 10)
          _ -> 0
        end

      _ ->
        0
    end
  end

  defp inning_to_scoreboard(1), do: "S1"
  defp inning_to_scoreboard(2), do: "S2"
  defp inning_to_scoreboard(3), do: "S3"
  defp inning_to_scoreboard(4), do: "S4"
  defp inning_to_scoreboard(value) when is_binary(value), do: value
  defp inning_to_scoreboard(_), do: "S1"

  defp scoreboard_inning("S1"), do: 1
  defp scoreboard_inning("S2"), do: 2
  defp scoreboard_inning("S3"), do: 3
  defp scoreboard_inning("S4"), do: 4
  defp scoreboard_inning(value) when is_integer(value), do: value
  defp scoreboard_inning(_), do: 1

  defp integer_or_zero(value) when is_integer(value), do: value
  defp integer_or_zero(value) when is_float(value), do: trunc(value)

  defp integer_or_zero(value) when is_binary(value) do
    case Integer.parse(String.trim(value)) do
      {parsed, _} -> parsed
      _ -> 0
    end
  end

  defp integer_or_zero(_), do: 0

  defp normalize_decimal(nil), do: nil
  defp normalize_decimal(%D{} = value), do: value
  defp normalize_decimal(value) when is_integer(value), do: D.new(value)
  defp normalize_decimal(value) when is_float(value), do: D.from_float(value)

  defp normalize_decimal(value) when is_binary(value) do
    case D.parse(String.trim(value)) do
      {decimal, ""} -> decimal
      _ -> nil
    end
  end

  defp normalize_decimal(_), do: nil

  defp decimal_or_string(nil), do: nil
  defp decimal_or_string(%D{} = value), do: D.to_string(value)

  defp truthy?(value) when value in [true, 1, "1", "true", "yes", "Yes"], do: true
  defp truthy?(_), do: false

  defp present_string(value) when is_binary(value) do
    case String.trim(value) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  defp present_string(_), do: nil
end
