defmodule Back.Tennis.ApiTennis.Normalizers.PointNormalizer do
  alias Back.Tennis.MatchState

  def normalize(payload, existing_state \\ nil) when is_map(payload) do
    point_by_point = normalize_point_by_point(payload["pointbypoint"] || payload[:pointbypoint])
    latest_point = latest_point(point_by_point)
    current_point_score = normalize_current_point_score(payload, latest_point, existing_state)

    %{
      event_key: string_value(payload, "event_key"),
      status: normalize_status(payload),
      event_status: compact_string(payload["event_status"] || payload[:event_status]),
      server: normalize_server_id(payload, existing_state),
      current_set: infer_current_set(payload["scores"] || payload[:scores], existing_state),
      current_game_score:
        compact_string(payload["event_game_result"] || payload[:event_game_result]),
      current_point_score: current_point_score,
      game_result: compact_string(payload["event_game_result"] || payload[:event_game_result]),
      final_result: compact_string(payload["event_final_result"] || payload[:event_final_result]),
      deuce?: current_point_score == "deuce",
      advantage_player: extract_advantage_player(current_point_score, payload, existing_state),
      tiebreak?: tiebreak?(payload),
      set_point?:
        truthy?(latest_point[:set_point?]) or truthy?(payload["set_point"] || payload[:set_point]),
      match_point?:
        truthy?(latest_point[:match_point?]) or
          truthy?(payload["match_point"] || payload[:match_point]),
      break_point?:
        truthy?(latest_point[:break_point?]) or
          truthy?(payload["break_point"] || payload[:break_point]),
      player_1_name:
        compact_string(
          payload["event_first_player"] || payload[:event_first_player] ||
            existing(existing_state, :player_1_name)
        ),
      player_2_name:
        compact_string(
          payload["event_second_player"] || payload[:event_second_player] ||
            existing(existing_state, :player_2_name)
        ),
      player_1_key:
        string_value(payload, "first_player_key") || existing(existing_state, :player_1_key),
      player_2_key:
        string_value(payload, "second_player_key") || existing(existing_state, :player_2_key),
      sets: normalize_sets(payload["scores"] || payload[:scores], existing_state),
      point_by_point: point_by_point,
      raw_livescore: payload
    }
  end

  defp normalize_status(%{"event_live" => "1"}), do: :live
  defp normalize_status(%{event_live: "1"}), do: :live
  defp normalize_status(%{"event_status" => "Finished"}), do: :finished
  defp normalize_status(%{event_status: "Finished"}), do: :finished
  defp normalize_status(%{"event_status" => status}) when status in [nil, ""], do: :scheduled
  defp normalize_status(%{event_status: status}) when status in [nil, ""], do: :scheduled
  defp normalize_status(_), do: :live

  defp normalize_server_id(payload, existing_state) do
    server =
      payload["event_serve_who"] ||
        payload[:event_serve_who] ||
        payload["event_serve"] ||
        payload[:event_serve] ||
        existing(existing_state, :server)

    player_1_name =
      compact_string(
        payload["event_first_player"] || payload[:event_first_player] ||
          existing(existing_state, :player_1_name)
      )

    player_2_name =
      compact_string(
        payload["event_second_player"] || payload[:event_second_player] ||
          existing(existing_state, :player_2_name)
      )

    value = compact_string(server) |> String.downcase()

    cond do
      value in ["1", "player_1", "first player"] ->
        "player_1"

      value in ["2", "player_2", "second player"] ->
        "player_2"

      player_1_name && player_1_name != "" &&
          String.contains?(value, String.downcase(player_1_name)) ->
        "player_1"

      player_2_name && player_2_name != "" &&
          String.contains?(value, String.downcase(player_2_name)) ->
        "player_2"

      true ->
        compact_string(server)
    end
  end

  defp normalize_current_point_score(payload, latest_point, existing_state) do
    score =
      latest_point[:score] ||
        latest_point["score"] ||
        payload["event_game_result"] ||
        payload[:event_game_result] ||
        existing(existing_state, :current_point_score)

    score
    |> compact_string()
    |> simplify_point_score()
  end

  defp simplify_point_score(nil), do: nil

  defp simplify_point_score(score) do
    normalized = score |> String.downcase() |> String.trim()

    cond do
      normalized in ["40-40", "40 - 40"] -> "deuce"
      String.contains?(normalized, "adv") -> normalized
      true -> normalized
    end
  end

  defp extract_advantage_player(score, payload, existing_state) when is_binary(score) do
    player_1_name =
      compact_string(
        payload["event_first_player"] || payload[:event_first_player] ||
          existing(existing_state, :player_1_name)
      )

    player_2_name =
      compact_string(
        payload["event_second_player"] || payload[:event_second_player] ||
          existing(existing_state, :player_2_name)
      )

    cond do
      String.contains?(score, "adv") and String.contains?(score, "1") -> player_1_name
      String.contains?(score, "adv") and String.contains?(score, "2") -> player_2_name
      true -> nil
    end
  end

  defp extract_advantage_player(_, _, _), do: nil

  defp infer_current_set(scores, _existing_state) when is_list(scores) and scores != [],
    do: length(scores)

  defp infer_current_set(_, %MatchState{current_set: current_set}) when is_integer(current_set),
    do: current_set

  defp infer_current_set(_, _), do: 1

  defp normalize_sets(scores, _existing_state) when is_list(scores) and scores != [] do
    Enum.map(scores, fn row ->
      %{
        set:
          row["score_set"] || row[:score_set] || row["set_number"] || row[:set_number] ||
            row["set"] || row[:set],
        player_1_games:
          row["score_first"] || row[:score_first] || row["home_score"] || row[:home_score],
        player_2_games:
          row["score_second"] || row[:score_second] || row["away_score"] || row[:away_score],
        tiebreak: row["score_tiebreak"] || row[:score_tiebreak]
      }
    end)
  end

  defp normalize_sets(_, %MatchState{sets: sets}) when is_list(sets), do: sets
  defp normalize_sets(_, _), do: []

  defp normalize_point_by_point(rows) when is_list(rows) do
    Enum.map(rows, fn row ->
      points =
        row["points"] || row[:points] || []

      normalized_points =
        Enum.map(List.wrap(points), fn point ->
          %{
            number: point["number_point"] || point[:number_point],
            score: compact_string(point["score"] || point[:score]),
            break_point?: truthy?(point["break_point"] || point[:break_point]),
            set_point?: truthy?(point["set_point"] || point[:set_point]),
            match_point?: truthy?(point["match_point"] || point[:match_point])
          }
        end)

      %{
        set: row["set_number"] || row[:set_number] || row["set"] || row[:set],
        game: row["number_game"] || row[:number_game] || row["game_number"] || row[:game_number],
        points: normalized_points,
        score: compact_string(row["score"] || row[:score]),
        server:
          compact_string(
            row["player_served"] || row[:player_served] || row["serve"] || row[:serve]
          ),
        break_point?: Enum.any?(normalized_points, & &1.break_point?),
        set_point?: Enum.any?(normalized_points, & &1.set_point?),
        match_point?: Enum.any?(normalized_points, & &1.match_point?)
      }
    end)
  end

  defp normalize_point_by_point(_), do: []

  defp latest_point(point_by_point) do
    point_by_point
    |> List.last()
    |> case do
      %{points: points} when is_list(points) -> List.last(points) || %{}
      _ -> %{}
    end
  end

  defp tiebreak?(payload) do
    truthy?(payload["event_tiebreak"] || payload[:event_tiebreak]) or
      String.contains?(
        to_string(payload["event_status"] || payload[:event_status] || ""),
        "Tie Break"
      )
  end

  defp compact_string(nil), do: nil
  defp compact_string(value), do: value |> to_string() |> String.trim()

  defp string_value(payload, key) do
    case Map.get(payload, key) || Map.get(payload, String.to_atom(key)) do
      nil -> nil
      value -> to_string(value)
    end
  end

  defp truthy?(value) when value in [true, "true", 1, "1", "yes", "Yes"], do: true
  defp truthy?(_), do: false

  defp existing(nil, _key), do: nil
  defp existing(%MatchState{} = state, key), do: Map.get(state, key)
end
