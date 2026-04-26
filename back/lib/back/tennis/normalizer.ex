defmodule Back.Tennis.Normalizer do
  alias Back.Tennis.MatchState
  alias Back.Tennis.Score

  def normalize_match_state(%MatchState{} = state) do
    score = normalize_score(state)

    %MatchState{
      state
      | score: score,
        deuce?: score.deuce?,
        advantage_player: score.advantage_player,
        tiebreak?: score.tiebreak?,
        break_point?: score.break_point?,
        set_point?: score.set_point?,
        match_point?: score.match_point?
    }
  end

  def normalize_match_state(other), do: other

  defp normalize_score(%MatchState{} = state) do
    current_game = normalize_current_game(state.current_game_score, state.current_point_score)
    server = normalize_server(state.server, state)
    sets = normalize_sets_summary(state.sets)
    tiebreak? = tiebreak_mode?(state, current_game)
    deuce? = deuce_mode?(current_game)
    advantage_player = advantage_player(current_game, state)

    %Score{
      sets: sets,
      current_game: current_game,
      server: server,
      mode: score_mode(tiebreak?, deuce?, advantage_player),
      deuce?: deuce?,
      advantage_player: advantage_player,
      tiebreak?: tiebreak?,
      break_point?: !!state.break_point?,
      set_point?: !!state.set_point?,
      match_point?: !!state.match_point?
    }
  end

  defp normalize_sets_summary(rows) when is_list(rows) do
    sets =
      Enum.map(rows, fn row ->
        %{
          set: row[:set] || row["set"] || row[:score_set] || row["score_set"],
          player_1:
            row[:player_1_games] || row["player_1_games"] || row[:score_first] ||
              row["score_first"] || "0",
          player_2:
            row[:player_2_games] || row["player_2_games"] || row[:score_second] ||
              row["score_second"] || "0",
          tiebreak: row[:tiebreak] || row["tiebreak"]
        }
      end)

    %{
      player_1: Enum.count(sets, &(to_int(&1.player_1) > to_int(&1.player_2))),
      player_2: Enum.count(sets, &(to_int(&1.player_2) > to_int(&1.player_1))),
      rows: sets
    }
  end

  defp normalize_sets_summary(_), do: %{player_1: 0, player_2: 0, rows: []}

  defp normalize_current_game(game_score, point_score) do
    parsed =
      cond do
        is_binary(game_score) and String.contains?(game_score, "-") ->
          parse_score_pair(game_score)

        is_binary(point_score) and String.contains?(point_score, "-") ->
          parse_score_pair(point_score)

        point_score == "deuce" ->
          %{player_1: "40", player_2: "40"}

        true ->
          %{player_1: fallback_left(game_score), player_2: fallback_right(game_score)}
      end

    parsed
  end

  defp parse_score_pair(score) when is_binary(score) do
    case score |> String.split("-", parts: 2) |> Enum.map(&String.trim/1) do
      [left, right] -> %{player_1: normalize_point(left), player_2: normalize_point(right)}
      _ -> %{player_1: "-", player_2: "-"}
    end
  end

  defp normalize_point(value) do
    normalized = value |> to_string() |> String.trim() |> String.downcase()

    cond do
      normalized in ["ad", "adv", "advantage"] -> "Ad"
      normalized == "deuce" -> "40"
      true -> String.upcase(normalized)
    end
  end

  defp fallback_left(score) when is_binary(score),
    do: score |> String.split("-", parts: 2) |> List.first() |> normalize_point()

  defp fallback_left(_), do: "-"

  defp fallback_right(score) when is_binary(score),
    do: score |> String.split("-", parts: 2) |> List.last() |> normalize_point()

  defp fallback_right(_), do: "-"

  defp normalize_server(nil, %MatchState{player_1_name: p1, player_2_name: p2} = state) do
    case state.server do
      ^p1 -> :player_1
      ^p2 -> :player_2
      _ -> :unknown
    end
  end

  defp normalize_server(server, %MatchState{player_1_name: p1, player_2_name: p2}) do
    value = to_string(server)

    cond do
      p1 && String.contains?(String.downcase(value), String.downcase(p1)) -> :player_1
      p2 && String.contains?(String.downcase(value), String.downcase(p2)) -> :player_2
      value in ["1", "player_1"] -> :player_1
      value in ["2", "player_2"] -> :player_2
      true -> :unknown
    end
  end

  defp deuce_mode?(%{player_1: "40", player_2: "40"}), do: true
  defp deuce_mode?(_), do: false

  defp advantage_player(%{player_1: "Ad"}, %MatchState{player_1_name: name}),
    do: name || "player_1"

  defp advantage_player(%{player_2: "Ad"}, %MatchState{player_2_name: name}),
    do: name || "player_2"

  defp advantage_player(_, _), do: nil

  defp tiebreak_mode?(%MatchState{} = state, current_game) do
    state.tiebreak? ||
      (numeric_point?(current_game.player_1) and numeric_point?(current_game.player_2)) ||
      Enum.any?(state.sets || [], fn row ->
        value = row[:tiebreak] || row["tiebreak"]
        value not in [nil, "", 0, "0"]
      end)
  end

  defp numeric_point?(value) when is_binary(value) do
    case Integer.parse(value) do
      {_int, ""} -> true
      _ -> false
    end
  end

  defp numeric_point?(_), do: false

  defp score_mode(true, _deuce, _advantage), do: :tiebreak
  defp score_mode(_tiebreak, true, nil), do: :deuce
  defp score_mode(_tiebreak, _deuce, advantage) when not is_nil(advantage), do: :advantage
  defp score_mode(_, _, _), do: :standard

  defp to_int(value) when is_integer(value), do: value

  defp to_int(value) when is_binary(value) do
    case Integer.parse(value) do
      {int, ""} -> int
      _ -> 0
    end
  end

  defp to_int(_), do: 0
end
