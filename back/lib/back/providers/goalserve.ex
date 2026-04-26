defmodule Back.Providers.Goalserve do
  @behaviour Back.Providers.Behaviour

  alias Back.SportsProviders.Goalserve, as: LegacyGoalserve

  @default_timezone "Europe/London"

  @impl true
  def fetch_fixtures(config) do
    config
    |> legacy_opts()
    |> LegacyGoalserve.fetch_fixtures()
    |> normalize_rows()
  end

  @impl true
  def fetch_live(config) do
    config
    |> legacy_opts()
    |> LegacyGoalserve.fetch_live()
    |> normalize_rows()
  end

  @impl true
  def fetch_fixtures_for_feed(config, feed) do
    config
    |> merge_feed_into_config(feed)
    |> fetch_fixtures()
  end

  @impl true
  def fetch_live_for_feed(config, feed) do
    config
    |> merge_feed_into_config(feed)
    |> fetch_live()
  end

  @impl true
  def fetch_odds_for_match(_config, _match), do: {:error, :provider_odds_not_supported}

  @impl true
  def normalize(raw) do
    participants = raw[:participants] || raw["participants"] || []
    {team1, team2} = racing_pair(participants, raw)

    %{
      external_id: value(raw, :provider_event_id) || value(raw, :external_id) || "",
      provider: "goalserve",
      sport: "horse_racing",
      team1: team1,
      team2: team2,
      start_time: value(raw, :start_time_utc) || value(raw, :start_time),
      status: normalize_status(value(raw, :status)),
      score: normalize_result(value(raw, :result)),
      raw: value(raw, :raw) || raw
    }
  end

  defp normalize_rows({:ok, rows}) when is_list(rows), do: {:ok, Enum.map(rows, &normalize/1)}
  defp normalize_rows(other), do: other

  defp merge_feed_into_config(config, feed) do
    config
    |> maybe_put("region", value(feed, :region))
    |> maybe_put("timezone", value(feed, :timezone))
    |> maybe_put("track", value(feed, :track))
    |> maybe_put("competition_key", value(feed, :competition_key))
  end

  defp legacy_opts(config) do
    []
    |> maybe_put_opt(:api_key, Map.get(config, "api_key"))
    |> maybe_put_opt(:base_url, Map.get(config, "base_url"))
    |> maybe_put_opt(:region, Map.get(config, "region"))
    |> maybe_put_opt(:timezone, Map.get(config, "timezone", @default_timezone))
  end

  defp racing_pair(participants, raw) do
    names =
      participants
      |> Enum.map(fn participant -> participant[:name] || participant["name"] end)
      |> Enum.reject(&(is_nil(&1) or String.trim(to_string(&1)) == ""))

    case names do
      [first, second | _] -> {first, second}
      [first] -> {first, competition_name(raw)}
      _ -> {competition_name(raw), "Field"}
    end
  end

  defp competition_name(raw) do
    value(raw, :competition_name) || value(raw, :name) || "Horse Race"
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

  defp value(map, key) when is_map(map),
    do: Map.get(map, key) || Map.get(map, Atom.to_string(key))

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, _key, ""), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  defp maybe_put_opt(opts, _key, nil), do: opts
  defp maybe_put_opt(opts, _key, ""), do: opts
  defp maybe_put_opt(opts, key, value), do: Keyword.put(opts, key, value)
end
