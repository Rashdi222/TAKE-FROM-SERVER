defmodule Back.Providers.Betsapi do
  @behaviour Back.Providers.Behaviour

  alias Back.SportsProviders.BetsApi, as: LegacyBetsApi

  @impl true
  def fetch_fixtures(config) do
    config
    |> fetch_fixture_rows()
    |> normalize_rows()
  end

  @impl true
  def fetch_live(config) do
    config
    |> fetch_live_rows()
    |> normalize_rows()
  end

  @impl true
  def fetch_fixtures_for_feed(config, feed) do
    config
    |> merge_feed_into_config(feed)
    |> fetch_fixtures()
    |> filter_for_feed(feed)
  end

  @impl true
  def fetch_live_for_feed(config, feed) do
    config
    |> merge_feed_into_config(feed)
    |> fetch_live()
    |> filter_for_feed(feed)
  end

  @impl true
  def fetch_odds_for_match(_config, _match), do: {:error, :provider_odds_not_supported}

  @impl true
  def normalize(raw) do
    participants = value(raw, :participants) || []
    {team1, team2} = pair_from_participants(participants, raw)

    %{
      external_id: value(raw, :provider_event_id) || value(raw, :external_id) || "",
      provider: "betsapi",
      sport: normalize_sport(value(raw, :sport)),
      team1: team1,
      team2: team2,
      start_time: value(raw, :start_time_utc) || value(raw, :start_time),
      status: normalize_status(value(raw, :status)),
      score: normalize_result(value(raw, :result)),
      raw: value(raw, :raw) || raw
    }
  end

  defp fetch_fixture_rows(config) do
    opts = legacy_opts(config)

    case target_sport(config) do
      :horse_racing -> LegacyBetsApi.fetch_upcoming_horse_racing(opts)
      :dog_racing -> LegacyBetsApi.fetch_fixtures(opts)
    end
  end

  defp fetch_live_rows(config) do
    opts = legacy_opts(config)

    case target_sport(config) do
      :horse_racing ->
        LegacyBetsApi.fetch_upcoming_horse_racing(opts)

      :dog_racing ->
        LegacyBetsApi.fetch_live(opts)
    end
  end

  defp normalize_rows({:ok, rows}) when is_list(rows), do: {:ok, Enum.map(rows, &normalize/1)}
  defp normalize_rows(other), do: other

  defp filter_for_feed({:ok, rows}, feed) do
    {:ok, Enum.filter(rows, &matches_feed_filter?(&1, feed))}
  end

  defp filter_for_feed(other, _feed), do: other

  defp matches_feed_filter?(row, feed) do
    competition_key =
      value(feed, :competition_key)
      |> normalize_string()

    track =
      value(feed, :track)
      |> normalize_string()

    row_haystack =
      [
        value(row, :team1),
        value(row, :team2),
        value(row, :sport),
        get_in(value(row, :raw) || %{}, ["league", "name"]),
        get_in(value(row, :raw) || %{}, ["league", "id"])
      ]
      |> Enum.map(&normalize_string/1)
      |> Enum.reject(&is_nil/1)
      |> Enum.join(" ")

    cond do
      competition_key && not String.contains?(row_haystack, competition_key) -> false
      track && not String.contains?(row_haystack, track) -> false
      true -> true
    end
  end

  defp merge_feed_into_config(config, feed) do
    config
    |> maybe_put("sport", value(feed, :sport))
    |> maybe_put("track", value(feed, :track))
    |> maybe_put("competition_key", value(feed, :competition_key))
    |> maybe_put("league_id", value(feed, :league_id))
  end

  defp legacy_opts(config) do
    []
    |> maybe_put_opt(:token, Map.get(config, "api_key"))
    |> maybe_put_opt(:base_url, Map.get(config, "base_url"))
    |> maybe_put_opt(:fallback_url, Map.get(config, "fallback_url"))
    |> maybe_put_opt(:page, Map.get(config, "page"))
    |> maybe_put_opt(:league_id, Map.get(config, "league_id"))
  end

  defp target_sport(config) do
    case normalize_string(Map.get(config, "sport")) do
      "horse_racing" -> :horse_racing
      "horse racing" -> :horse_racing
      _ -> :dog_racing
    end
  end

  defp normalize_sport(:horse_racing), do: "horse_racing"
  defp normalize_sport(:greyhound), do: "dog_racing"
  defp normalize_sport(:dog_racing), do: "dog_racing"
  defp normalize_sport("horse_racing"), do: "horse_racing"
  defp normalize_sport("dog_racing"), do: "dog_racing"
  defp normalize_sport("greyhound"), do: "dog_racing"
  defp normalize_sport(_), do: "dog_racing"

  defp pair_from_participants(participants, raw) do
    names =
      participants
      |> Enum.map(fn participant -> participant[:name] || participant["name"] end)
      |> Enum.reject(&(is_nil(&1) or String.trim(to_string(&1)) == ""))

    case names do
      [first, second | _] -> {first, second}
      [first] -> {first, league_name(raw)}
      _ -> {league_name(raw), "Field"}
    end
  end

  defp league_name(raw) do
    get_in(value(raw, :raw) || %{}, ["league", "name"]) ||
      value(raw, :competition_name) ||
      "Race"
  end

  defp normalize_status(:live), do: "live"
  defp normalize_status(:finished), do: "completed"
  defp normalize_status(:cancelled), do: "cancelled"
  defp normalize_status(:scheduled), do: "upcoming"
  defp normalize_status(:unknown), do: "upcoming"
  defp normalize_status(status) when is_binary(status), do: status
  defp normalize_status(_), do: "upcoming"

  defp normalize_result(nil), do: %{}
  defp normalize_result(result) when is_map(result), do: result
  defp normalize_result(_), do: %{}

  defp normalize_string(nil), do: nil
  defp normalize_string(value), do: value |> to_string() |> String.downcase() |> String.trim()

  defp value(map, key) when is_map(map),
    do: Map.get(map, key) || Map.get(map, Atom.to_string(key))

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, _key, ""), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  defp maybe_put_opt(opts, _key, nil), do: opts
  defp maybe_put_opt(opts, _key, ""), do: opts
  defp maybe_put_opt(opts, key, value), do: Keyword.put(opts, key, value)
end
