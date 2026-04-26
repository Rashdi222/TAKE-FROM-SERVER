defmodule Back.Providers.FootballCompetitionDiscovery do
  alias Back.Providers
  alias Back.Settings

  @cache_ttl_seconds 6 * 60 * 60

  def list_competitions(opts \\ []) do
    provider_name = Keyword.get(opts, :provider_name, "api_sports")
    force_refresh = Keyword.get(opts, :force_refresh, false)

    with {:ok, provider} <- Providers.get_enabled_provider_by_name(provider_name) do
      if not force_refresh and fresh_cache?(provider.id) do
        case Settings.get(cache_key(provider.id), nil) do
          items when is_list(items) -> {:ok, items}
          _ -> fetch_and_cache(provider)
        end
      else
        fetch_and_cache(provider)
      end
    end
  end

  def fetch_and_cache(provider) do
    with {:ok, competitions} <- fetch_competitions(provider),
         {:ok, _} <- Settings.put(cache_key(provider.id), competitions),
         {:ok, _} <-
           Settings.put(cache_ts_key(provider.id), DateTime.utc_now() |> DateTime.to_iso8601()) do
      {:ok, competitions}
    end
  end

  defp fetch_competitions(%{name: "api_sports"} = provider),
    do: fetch_api_sports_competitions(provider)

  defp fetch_competitions(_), do: {:error, :provider_not_supported}

  defp fetch_api_sports_competitions(provider) do
    base_url = Map.get(provider_config(provider), "base_url", "https://v3.football.api-sports.io")
    api_key = provider.api_key

    headers =
      [{"Accept", "application/json"}] ++
        if is_binary(api_key) and String.trim(api_key) != "" do
          [{"x-apisports-key", api_key}]
        else
          []
        end

    case Req.get(base_url <> "/leagues", headers: headers, params: %{"current" => "true"}) do
      {:ok, %{status: 200, body: body}} ->
        competitions =
          body
          |> Map.get("response", [])
          |> Enum.map(&normalize_api_sports_competition/1)
          |> Enum.reject(&is_nil/1)
          |> Enum.uniq_by(& &1.id)
          |> Enum.sort_by(
            &{String.downcase(&1.country_name || "zzz"),
             String.downcase(&1.display_name || &1.name || "zzz")}
          )

        {:ok, competitions}

      {:ok, %{status: status, body: body}} ->
        {:error, {:http_error, status, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp normalize_api_sports_competition(raw) when is_map(raw) do
    league = raw["league"] || %{}
    country = raw["country"] || %{}
    seasons = raw["seasons"] || []
    season = current_or_latest_season(seasons)

    league_id = present_string(league["id"])
    league_name = present_string(league["name"])
    season_year = present_string(season && season["year"])

    if league_id && league_name && season_year do
      country_name = present_string(country["name"])
      type = present_string(league["type"]) || "League"
      display_name = Enum.join([league_name, season_year], " ")
      coverage = (season && season["coverage"]) || %{}
      fixtures_coverage = Map.get(coverage, "fixtures", %{})
      odds_coverage = Map.get(coverage, "odds")

      %{
        id: "api_sports:#{league_id}:#{season_year}",
        provider: "api_sports",
        sport: "football",
        name: league_name,
        display_name: display_name,
        competition_key: slugify("#{league_name}_#{season_year}"),
        category: slugify(country_name || type),
        category_label: country_name || type,
        league_id: league_id,
        season_id: season_year,
        season_name: season_year,
        season_label: season_year,
        country_name: country_name,
        country_code: present_string(country["code"]),
        logo_url: present_string(league["logo"]),
        fixture_coverage: coverage_available?(fixtures_coverage),
        live_coverage: coverage_available?(Map.get(fixtures_coverage, "events")),
        odds_coverage: coverage_available?(odds_coverage),
        raw_context: raw
      }
    end
  end

  defp normalize_api_sports_competition(_), do: nil

  defp current_or_latest_season(seasons) when is_list(seasons) do
    Enum.find(seasons, fn item -> item["current"] == true end) ||
      Enum.max_by(seasons, &to_sortable_year(&1["year"]), fn -> nil end)
  end

  defp current_or_latest_season(_), do: nil

  defp to_sortable_year(value) when is_integer(value), do: value

  defp to_sortable_year(value) when is_binary(value) do
    case Integer.parse(String.trim(value)) do
      {year, _} -> year
      _ -> 0
    end
  end

  defp to_sortable_year(_), do: 0

  defp provider_config(provider), do: provider.config || %{}

  defp present_string(value) when is_binary(value) do
    case String.trim(value) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  defp present_string(value) when is_integer(value), do: Integer.to_string(value)
  defp present_string(_), do: nil

  defp coverage_available?(value) when value in [true, "true"], do: true
  defp coverage_available?(value) when value in [false, "false", nil], do: false
  defp coverage_available?(value) when is_map(value), do: map_size(value) > 0
  defp coverage_available?(_), do: false

  defp slugify(value) when is_binary(value) do
    value
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, "_")
    |> String.trim("_")
  end

  defp fresh_cache?(provider_id) do
    case Settings.get(cache_ts_key(provider_id), nil) do
      value when is_binary(value) ->
        with {:ok, timestamp, _offset} <- DateTime.from_iso8601(value) do
          DateTime.diff(DateTime.utc_now(), timestamp, :second) < @cache_ttl_seconds
        else
          _ -> false
        end

      _ ->
        false
    end
  end

  defp cache_key(provider_id), do: "football_competitions:" <> provider_id
  defp cache_ts_key(provider_id), do: "football_competitions_cached_at:" <> provider_id
end
