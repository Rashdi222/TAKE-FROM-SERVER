defmodule Back.AI.Automation.FeedConfig do
  @moduledoc false

  @default_prematch_bet_types [:match_winner, :over_under]
  @default_inplay_bet_types [:match_winner, :over_under, :in_play]
  @default_live_ai_publish_mode "auto_publish"

  def prematch_enabled?(feed), do: truthy?(config(feed)["auto_generate_prematch_odds"])
  def inplay_enabled?(feed), do: truthy?(config(feed)["auto_generate_inplay_odds"])

  def prematch_window_minutes(feed),
    do: positive_int(config(feed)["prematch_generation_window_minutes"], 180)

  def inplay_interval_seconds(feed) do
    positive_int(
      config(feed)["inplay_generation_interval_seconds"],
      feed.live_poll_interval_seconds || 30
    )
  end

  def max_runs_per_match(feed), do: positive_int(config(feed)["max_automation_runs_per_match"], 8)

  def auto_regenerate_on_live_change?(feed),
    do: truthy?(config(feed)["auto_regenerate_on_live_change"], true)

  def require_admin_publish?(feed), do: truthy?(config(feed)["require_admin_publish"], true)

  def live_ai_publish_mode(feed),
    do: normalize_live_ai_publish_mode(config(feed)["live_ai_publish_mode"])

  def live_ai_auto_publish?(feed), do: live_ai_publish_mode(feed) == "auto_publish"
  def live_ai_review_required?(feed), do: live_ai_publish_mode(feed) == "review_required"

  def prematch_bet_types(feed),
    do: normalize_bet_types(config(feed)["prematch_bet_types"], prematch_default_bet_types(feed))

  def inplay_bet_types(feed),
    do: normalize_bet_types(config(feed)["inplay_bet_types"], inplay_default_bet_types(feed))

  def merge_automation_config(existing_config, attrs)
      when is_map(existing_config) and is_map(attrs) do
    incoming_config =
      attrs["config"] || attrs[:config] || %{}

    config =
      (existing_config || %{})
      |> Map.merge(normalize_config(incoming_config))

    config
    |> maybe_put(
      "auto_generate_prematch_odds",
      attrs["auto_generate_prematch_odds"] || attrs[:auto_generate_prematch_odds]
    )
    |> maybe_put(
      "auto_generate_inplay_odds",
      attrs["auto_generate_inplay_odds"] || attrs[:auto_generate_inplay_odds]
    )
    |> maybe_put(
      "prematch_generation_window_minutes",
      attrs["prematch_generation_window_minutes"] || attrs[:prematch_generation_window_minutes]
    )
    |> maybe_put(
      "inplay_generation_interval_seconds",
      attrs["inplay_generation_interval_seconds"] || attrs[:inplay_generation_interval_seconds]
    )
    |> maybe_put(
      "auto_regenerate_on_live_change",
      attrs["auto_regenerate_on_live_change"] || attrs[:auto_regenerate_on_live_change]
    )
    |> maybe_put(
      "max_automation_runs_per_match",
      attrs["max_automation_runs_per_match"] || attrs[:max_automation_runs_per_match]
    )
    |> maybe_put(
      "require_admin_publish",
      attrs["require_admin_publish"] || attrs[:require_admin_publish]
    )
    |> maybe_put(
      "live_ai_publish_mode",
      normalize_live_ai_publish_mode(
        attrs["live_ai_publish_mode"] || attrs[:live_ai_publish_mode]
      )
    )
    |> maybe_put_bet_types(
      "prematch_bet_types",
      attrs["prematch_bet_types"] || attrs[:prematch_bet_types]
    )
    |> maybe_put_bet_types(
      "inplay_bet_types",
      attrs["inplay_bet_types"] || attrs[:inplay_bet_types]
    )
  end

  defp config(feed), do: Map.get(feed, :config) || Map.get(feed, "config") || %{}

  defp normalize_bet_types(nil, defaults), do: defaults

  defp normalize_bet_types(values, defaults) when is_binary(values) do
    values
    |> String.split(",", trim: true)
    |> Enum.map(&String.trim/1)
    |> normalize_bet_types(defaults)
  end

  defp normalize_bet_types(values, defaults) when is_list(values) do
    parsed =
      values
      |> Enum.map(&normalize_bet_type/1)
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()

    if parsed == [], do: defaults, else: parsed
  end

  defp normalize_bet_types(_, defaults), do: defaults

  defp normalize_bet_type(:match_winner), do: :match_winner
  defp normalize_bet_type(:over_under), do: :over_under
  defp normalize_bet_type(:double_chance), do: :double_chance
  defp normalize_bet_type(:btts), do: :btts
  defp normalize_bet_type(:in_play), do: :in_play
  defp normalize_bet_type("match_winner"), do: :match_winner
  defp normalize_bet_type("over_under"), do: :over_under
  defp normalize_bet_type("double_chance"), do: :double_chance
  defp normalize_bet_type("btts"), do: :btts
  defp normalize_bet_type("in_play"), do: :in_play
  defp normalize_bet_type(_), do: nil

  defp normalize_config(map) when is_map(map),
    do: Map.new(map, fn {key, value} -> {to_string(key), value} end)

  defp normalize_config(_), do: %{}

  defp maybe_put(config, _key, nil), do: config
  defp maybe_put(config, key, value), do: Map.put(config, key, value)

  defp maybe_put_bet_types(config, _key, nil), do: config

  defp maybe_put_bet_types(config, key, values) do
    normalized = normalize_bet_types(values, [])

    if normalized == [],
      do: config,
      else: Map.put(config, key, Enum.map(normalized, &to_string/1))
  end

  defp truthy?(value, default \\ false)
  defp truthy?(nil, default), do: default
  defp truthy?(value, _default) when value in [true, "true", 1, "1"], do: true
  defp truthy?(_value, _default), do: false

  defp positive_int(nil, default), do: default
  defp positive_int(value, _default) when is_integer(value) and value > 0, do: value

  defp positive_int(value, default) when is_binary(value) do
    case Integer.parse(String.trim(value)) do
      {parsed, ""} when parsed > 0 -> parsed
      _ -> default
    end
  end

  defp positive_int(_value, default), do: default

  defp normalize_live_ai_publish_mode("review_required"), do: "review_required"
  defp normalize_live_ai_publish_mode(:review_required), do: "review_required"
  defp normalize_live_ai_publish_mode("auto_publish"), do: "auto_publish"
  defp normalize_live_ai_publish_mode(:auto_publish), do: "auto_publish"
  defp normalize_live_ai_publish_mode(_), do: @default_live_ai_publish_mode

  defp prematch_default_bet_types(feed) do
    case Map.get(feed, :sport) || Map.get(feed, "sport") do
      "football" -> [:match_winner, :over_under]
      "tennis" -> [:match_winner, :over_under]
      "cricket" -> [:match_winner, :over_under]
      _ -> @default_prematch_bet_types
    end
  end

  defp inplay_default_bet_types(feed) do
    case Map.get(feed, :sport) || Map.get(feed, "sport") do
      "cricket" -> [:match_winner, :over_under, :in_play]
      "football" -> [:match_winner, :over_under, :in_play]
      "tennis" -> [:match_winner, :over_under, :in_play]
      _ -> @default_inplay_bet_types
    end
  end
end
