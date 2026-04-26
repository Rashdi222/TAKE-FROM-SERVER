defmodule Back.Providers.AdapterUtils do
  @moduledoc false

  def first_non_nil(values) when is_list(values) do
    Enum.find(values, fn
      nil -> false
      "" -> false
      _ -> true
    end)
  end

  def as_list(%{"data" => list}) when is_list(list), do: list
  def as_list(%{"response" => list}) when is_list(list), do: list
  def as_list(%{"result" => list}) when is_list(list), do: list
  def as_list(list) when is_list(list), do: list
  def as_list(_), do: []

  def normalize_status(value) do
    key = normalize_status_key(value)

    cond do
      key in live_status_keys() or live_status_key?(key) -> "live"
      key in completed_status_keys() -> "completed"
      key in cancelled_status_keys() -> "cancelled"
      true -> "upcoming"
    end
  end

  def normalize_market_availability(value) do
    key = normalize_status_key(value)

    cond do
      key in suspended_market_keys() -> :suspended
      key in closed_market_keys() -> :closed
      true -> :active
    end
  end

  def infer_sport(raw, fallback \\ "cricket")

  def infer_sport(%{"sport" => %{"name" => name}}, fallback), do: infer_sport(name, fallback)
  def infer_sport(%{"sport" => name}, fallback), do: infer_sport(name, fallback)
  def infer_sport(%{"league" => %{"name" => name}}, fallback), do: infer_sport(name, fallback)

  def infer_sport(value, fallback) when is_binary(value) do
    normalized = value |> String.downcase() |> String.trim()

    cond do
      String.contains?(normalized, "football") or String.contains?(normalized, "soccer") ->
        "football"

      String.contains?(normalized, "cricket") ->
        "cricket"

      String.contains?(normalized, "tennis") ->
        "tennis"

      String.contains?(normalized, "horse") ->
        "horse_racing"

      String.contains?(normalized, "dog") or String.contains?(normalized, "greyhound") ->
        "dog_racing"

      true ->
        fallback
    end
  end

  def infer_sport(_, fallback), do: fallback

  def feed_params(feed, extra \\ %{}) when is_map(feed) do
    extra
    |> maybe_put("league_id", value(feed, :league_id))
    |> maybe_put("season_id", value(feed, :season_id))
    |> maybe_put("region", value(feed, :region))
    |> maybe_put("track", value(feed, :track))
    |> maybe_put("competition_key", value(feed, :competition_key))
  end

  def sportmonks_feed_params(feed, extra \\ %{}) when is_map(feed) do
    extra
    |> maybe_put("filter[league_id]", value(feed, :league_id))
    |> maybe_put("filter[season_id]", value(feed, :season_id))
  end

  def api_sports_feed_params(feed, extra \\ %{}) when is_map(feed) do
    extra
    |> maybe_put("league", value(feed, :league_id))
    |> maybe_put("season", value(feed, :season_id))
  end

  def merge_params(base, extra) when is_map(base) and is_map(extra), do: Map.merge(base, extra)

  def build_endpoint(template, replacements \\ %{})
      when is_binary(template) and is_map(replacements) do
    Enum.reduce(replacements, template, fn {key, value}, acc ->
      String.replace(acc, "{#{key}}", to_string(value))
    end)
  end

  defp value(feed, key), do: Map.get(feed, key) || Map.get(feed, Atom.to_string(key))

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, _key, ""), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  defp normalize_status_key(%{"state" => state}), do: normalize_status_key(state)
  defp normalize_status_key(%{state: state}), do: normalize_status_key(state)
  defp normalize_status_key(%{"type" => type}), do: normalize_status_key(type)
  defp normalize_status_key(%{type: type}), do: normalize_status_key(type)
  defp normalize_status_key(%{"name" => name}), do: normalize_status_key(name)
  defp normalize_status_key(%{name: name}), do: normalize_status_key(name)
  defp normalize_status_key(%{"short_name" => name}), do: normalize_status_key(name)
  defp normalize_status_key(%{short_name: name}), do: normalize_status_key(name)
  defp normalize_status_key(%{"short" => name}), do: normalize_status_key(name)
  defp normalize_status_key(%{short: name}), do: normalize_status_key(name)
  defp normalize_status_key(%{"status" => status}), do: normalize_status_key(status)
  defp normalize_status_key(%{status: status}), do: normalize_status_key(status)
  defp normalize_status_key(%{"blocked" => true}), do: "blocked"
  defp normalize_status_key(%{blocked: true}), do: "blocked"
  defp normalize_status_key(%{"suspended" => true}), do: "suspended"
  defp normalize_status_key(%{suspended: true}), do: "suspended"
  defp normalize_status_key(%{"live" => true}), do: "live"
  defp normalize_status_key(%{live: true}), do: "live"
  defp normalize_status_key(%{"is_live" => true}), do: "live"
  defp normalize_status_key(%{is_live: true}), do: "live"
  defp normalize_status_key(%{"paused" => true}), do: "paused"
  defp normalize_status_key(%{paused: true}), do: "paused"
  defp normalize_status_key(%{"stopped" => true}), do: "stopped"
  defp normalize_status_key(%{stopped: true}), do: "stopped"
  defp normalize_status_key(%{"finished" => true}), do: "finished"
  defp normalize_status_key(%{finished: true}), do: "finished"
  defp normalize_status_key(%{"closed" => true}), do: "closed"
  defp normalize_status_key(%{closed: true}), do: "closed"
  defp normalize_status_key(%{}), do: "active"
  defp normalize_status_key(value) when is_integer(value), do: Integer.to_string(value)

  defp normalize_status_key(value) when is_binary(value) do
    value
    |> String.downcase()
    |> String.trim()
    |> String.replace(~r/[\s_-]+/, " ")
  end

  defp normalize_status_key(value), do: value |> to_string() |> normalize_status_key()

  defp live_status_keys do
    [
      "live",
      "inplay",
      "in progress",
      "in_progress",
      "1h",
      "2h",
      "ht",
      "et",
      "p",
      "bt",
      "3",
      "1st innings",
      "2nd innings",
      "innings break",
      "innings_break",
      "tea break",
      "lunch",
      "drinks",
      "super over",
      "super_over",
      "stumps"
    ]
  end

  defp completed_status_keys do
    [
      "completed",
      "finished",
      "ft",
      "aet",
      "pen",
      "2",
      "result",
      "match end",
      "match ended"
    ]
  end

  defp cancelled_status_keys do
    [
      "cancelled",
      "canc",
      "abandoned",
      "abd",
      "awd",
      "wo",
      "no result",
      "no_result"
    ]
  end

  defp live_status_key?(key) when is_binary(key) do
    normalized = String.trim(key)

    normalized == "1" or
      String.contains?(normalized, "live") or
      String.contains?(normalized, "in play") or
      String.contains?(normalized, "inplay") or
      String.contains?(normalized, "innings") or
      String.contains?(normalized, "super over")
  end

  defp live_status_key?(_), do: false

  defp suspended_market_keys do
    [
      "suspended",
      "suspend",
      "paused",
      "pause",
      "blocked",
      "temporary suspension",
      "temporarily unavailable"
    ]
  end

  defp closed_market_keys do
    [
      "closed",
      "close",
      "stopped",
      "stop",
      "finished",
      "complete",
      "completed",
      "ended",
      "retired",
      "settled"
    ]
  end
end
