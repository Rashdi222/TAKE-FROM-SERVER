defmodule Back.Providers.CricketCompetitionDiscovery do
  alias Back.Providers.AdapterUtils
  alias Back.Providers
  alias Back.Settings

  @cache_ttl_seconds 6 * 60 * 60
  @default_endpoint "/leagues"
  @default_base_url "https://cricket.sportmonks.com/api/v2.0"

  def list_competitions(opts \\ []) do
    force_refresh = Keyword.get(opts, :force_refresh, false)

    with {:ok, provider} <- Providers.get_enabled_provider_by_name("sportmonks") do
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

  def resolve_current_season(league_id) when is_binary(league_id) do
    normalized_league_id = String.trim(league_id)

    with false <- normalized_league_id == "",
         {:ok, provider} <- Providers.get_enabled_provider_by_name("sportmonks"),
         {:ok, resolved} <- fetch_current_season_for_league(provider, normalized_league_id) do
      {:ok, resolved}
    else
      true -> {:error, :invalid_provider_payload}
      other -> other
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

  defp fetch_competitions(provider) do
    config = provider.config || %{}
    endpoint = Map.get(config, "cricket_discovery_endpoint", @default_endpoint)

    params =
      config
      |> Map.get("cricket_discovery_params", %{"include" => "season,seasons"})
      |> normalize_map_keys()

    with {:ok, competitions} <- try_league_discovery(provider, endpoint, params) do
      if competitions == [] do
        fetch_competitions_from_seasons(provider, config)
      else
        {:ok, competitions}
      end
    end
  end

  defp fetch_competitions_from_seasons(provider, config) do
    endpoint = Map.get(config, "cricket_discovery_fallback_endpoint", "/seasons")

    params =
      config
      |> Map.get("cricket_discovery_fallback_params", %{"include" => "league"})
      |> normalize_map_keys()

    try_season_discovery(provider, endpoint, params)
  end

  defp try_league_discovery(provider, endpoint, params) do
    [
      {endpoint, params},
      {endpoint, %{}}
    ]
    |> Enum.reduce_while({:error, {:http_error, 400, "league discovery failed"}}, fn {ep, prms},
                                                                                     _acc ->
      case request(provider, ep, prms) do
        {:ok, body} ->
          competitions =
            body
            |> extract_data()
            |> Enum.map(&normalize_league_competition/1)
            |> Enum.reject(&is_nil/1)
            |> Enum.uniq_by(& &1.id)
            |> Enum.sort_by(&sort_key/1)

          {:halt, {:ok, competitions}}

        {:error, {:http_error, 400, _} = reason} ->
          {:cont, {:error, reason}}

        other ->
          {:halt, other}
      end
    end)
  end

  defp try_season_discovery(provider, endpoint, params) do
    [
      {endpoint, params},
      {endpoint, %{}}
    ]
    |> Enum.reduce_while({:error, {:http_error, 400, "season discovery failed"}}, fn {ep, prms},
                                                                                     _acc ->
      case request(provider, ep, prms) do
        {:ok, body} ->
          competitions =
            body
            |> extract_data()
            |> Enum.map(&normalize_season_competition/1)
            |> Enum.reject(&is_nil/1)
            |> Enum.uniq_by(& &1.id)
            |> Enum.sort_by(&sort_key/1)

          {:halt, {:ok, competitions}}

        {:error, {:http_error, 400, _} = reason} ->
          {:cont, {:error, reason}}

        other ->
          {:halt, other}
      end
    end)
  end

  defp fetch_current_season_for_league(provider, league_id) do
    attempts = [
      {"/leagues/#{league_id}", %{"include" => "season,seasons"}},
      {"/leagues/#{league_id}", %{"include" => "season"}},
      {"/leagues/#{league_id}", %{"include" => "seasons"}},
      {"/seasons", %{"filter[league_id]" => league_id}},
      {"/seasons", %{"league_id" => league_id}}
    ]

    Enum.reduce_while(
      attempts,
      {:error, {:http_error, 400, "unable to resolve season for league"}},
      fn {endpoint, params}, _acc ->
        case request(provider, endpoint, params) do
          {:ok, body} ->
            case normalize_current_season_resolution(body, league_id) do
              nil -> {:cont, {:error, {:http_error, 400, "unable to resolve season for league"}}}
              resolved -> {:halt, {:ok, resolved}}
            end

          {:error, {:http_error, status, _body} = reason}
          when status in [400, 401, 403, 404, 422, 502, 523] ->
            {:cont, {:error, reason}}

          other ->
            {:halt, other}
        end
      end
    )
  end

  defp request(provider, endpoint, params) do
    config = provider_config(provider)

    base_url =
      config
      |> Map.get("base_url", @default_base_url)
      |> normalize_base_url()

    api_key = Map.get(config, "api_key")
    auth_attempts = build_auth_attempts(api_key)

    Enum.reduce_while(
      auth_attempts,
      {:error, {:http_error, 400, "provider request failed"}},
      fn attempt, _acc ->
        case perform_request(base_url, endpoint, params, attempt) do
          {:ok, _body} = ok ->
            {:halt, ok}

          {:error, {:http_error, status, _body} = reason}
          when status in [400, 401, 403, 404, 422, 523] ->
            {:cont, {:error, reason}}

          other ->
            {:halt, other}
        end
      end
    )
  end

  defp perform_request(base_url, endpoint, params, %{headers: headers, extra_params: extra_params}) do
    merged_params = AdapterUtils.merge_params(params, extra_params)

    case Req.get(base_url <> endpoint, headers: headers, params: merged_params) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {:http_error, status, body}}
      {:error, reason} -> {:error, reason}
    end
  end

  defp build_auth_attempts(api_key) when is_binary(api_key) do
    trimmed = String.trim(api_key)

    if trimmed == "" do
      [%{headers: [{"Accept", "application/json"}], extra_params: %{}}]
    else
      [
        %{
          headers: [{"Accept", "application/json"}],
          extra_params: %{"api_token" => trimmed}
        },
        %{
          headers: [
            {"Accept", "application/json"},
            {"Authorization", "Bearer #{trimmed}"}
          ],
          extra_params: %{}
        }
      ]
    end
  end

  defp build_auth_attempts(_),
    do: [%{headers: [{"Accept", "application/json"}], extra_params: %{}}]

  defp normalize_league_competition(raw) when is_map(raw) do
    season = extract_current_season(raw)

    if is_map(season) do
      league_id = present_string(raw["id"])
      season_id = present_string(season["id"])
      league_name = present_string(raw["name"]) || present_string(get_in(raw, ["league", "name"]))

      if league_id && season_id && league_name do
        build_competition(league_name, league_id, season, raw)
      end
    end
  end

  defp normalize_league_competition(_), do: nil

  defp normalize_season_competition(raw) when is_map(raw) do
    league = raw["league"] || raw["tournament"] || %{}
    league_name = present_string(league["name"]) || present_string(raw["name"])
    league_id = present_string(league["id"]) || present_string(raw["league_id"])
    season_id = present_string(raw["id"])

    if league_name && league_id && season_id do
      build_competition(league_name, league_id, raw, league)
    end
  end

  defp normalize_season_competition(_), do: nil

  defp normalize_current_season_resolution(body, league_id) do
    data =
      case body do
        %{"data" => data} -> data
        other -> other
      end

    cond do
      is_map(data) ->
        league_name =
          present_string(data["name"]) || present_string(get_in(data, ["league", "name"]))

        season = extract_current_season(data) || latest_season(data["seasons"])
        build_resolved_season(league_id, league_name, season)

      is_list(data) ->
        season =
          data
          |> Enum.filter(&is_map/1)
          |> Enum.find(fn item ->
            present_string(item["league_id"]) == league_id or
              present_string(get_in(item, ["league", "id"])) == league_id
          end) || List.first(data)

        league_name =
          if is_map(season) do
            present_string(get_in(season, ["league", "name"]))
          end

        build_resolved_season(league_id, league_name, season)

      true ->
        nil
    end
  end

  defp build_resolved_season(_league_id, _league_name, nil), do: nil

  defp build_resolved_season(league_id, league_name, season) when is_map(season) do
    season_id = present_string(season["id"])

    if season_id do
      season_name = present_string(season["name"]) || present_string(season["code"]) || season_id

      %{
        provider: "sportmonks",
        sport: "cricket",
        league_id: league_id,
        league_name: league_name,
        season_id: season_id,
        season_name: season_name,
        season_label: season_label(season_name, season),
        starts_at: first_present([season["starting_at"], season["start_date"]]),
        ends_at: first_present([season["ending_at"], season["end_date"]]),
        raw_context: %{"season" => sanitize_context(season)}
      }
    end
  end

  defp build_competition(league_name, league_id, season, raw_context) do
    season_id = present_string(season["id"])
    season_name = present_string(season["name"]) || present_string(season["code"]) || season_id
    category = categorize(league_name)

    %{
      id: "#{league_id}:#{season_id}",
      provider: "sportmonks",
      sport: "cricket",
      name: league_name,
      display_name: league_name,
      competition_key: slugify([league_name, season_name]),
      category: category,
      category_label: category_label(category),
      league_id: league_id,
      season_id: season_id,
      season_name: season_name,
      season_label: season_label(season_name, season),
      starts_at: first_present([season["starting_at"], season["start_date"]]),
      ends_at: first_present([season["ending_at"], season["end_date"]]),
      raw_context: %{
        "league" => sanitize_context(raw_context),
        "season" => sanitize_context(season)
      }
    }
  end

  defp provider_config(provider) do
    (provider.config || %{})
    |> Map.put_new("base_url", provider.base_url)
    |> Map.put_new("api_key", provider.api_key)
  end

  defp extract_data(%{"data" => data}) when is_list(data), do: data
  defp extract_data(%{"data" => %{"data" => data}}) when is_list(data), do: data
  defp extract_data(%{"response" => data}) when is_list(data), do: data
  defp extract_data(list) when is_list(list), do: list
  defp extract_data(_), do: []

  defp extract_current_season(raw) do
    raw["currentseason"] || raw["currentSeason"] || raw["current_season"] || raw["season"] ||
      latest_season(raw["seasons"])
  end

  defp latest_season(seasons) when is_list(seasons) do
    seasons
    |> Enum.filter(&is_map/1)
    |> Enum.sort_by(
      fn season ->
        first_present([
          season["starting_at"],
          season["start_date"],
          season["updated_at"],
          season["id"]
        ]) || ""
      end,
      :desc
    )
    |> List.first()
  end

  defp latest_season(_), do: nil

  defp categorize(name) do
    normalized = String.downcase(name)

    cond do
      Enum.any?(
        ["ipl", "psl", "bbl", "cpl", "the hundred", "sa20", "ilt20", "lpl", "bpl"],
        &String.contains?(normalized, &1)
      ) ->
        "franchise_t20"

      Enum.any?(
        [
          "world cup",
          "champions trophy",
          "asia cup",
          "test championship",
          "t20i",
          "odi",
          "test",
          "international",
          "tri-series",
          "bilateral"
        ],
        &String.contains?(normalized, &1)
      ) ->
        "international"

      true ->
        "domestic"
    end
  end

  defp category_label("franchise_t20"), do: "Franchise T20"
  defp category_label("international"), do: "International"
  defp category_label("domestic"), do: "Domestic"
  defp category_label(_), do: "Other"

  defp season_label(season_name, season) do
    start_date = first_present([season["starting_at"], season["start_date"]])
    end_date = first_present([season["ending_at"], season["end_date"]])

    [season_name, compact_date_range(start_date, end_date)]
    |> Enum.reject(&is_nil/1)
    |> Enum.reject(&(&1 == ""))
    |> Enum.join(" · ")
  end

  defp compact_date_range(nil, nil), do: nil
  defp compact_date_range(start_date, nil), do: trim_iso_date(start_date)
  defp compact_date_range(nil, end_date), do: trim_iso_date(end_date)

  defp compact_date_range(start_date, end_date),
    do: "#{trim_iso_date(start_date)} to #{trim_iso_date(end_date)}"

  defp trim_iso_date(value) when is_binary(value), do: String.slice(value, 0, 10)
  defp trim_iso_date(value), do: to_string(value)

  defp sanitize_context(map) when is_map(map) do
    Map.take(map, [
      "id",
      "name",
      "code",
      "starting_at",
      "start_date",
      "ending_at",
      "end_date",
      "type"
    ])
  end

  defp sanitize_context(_), do: %{}

  defp sort_key(item) do
    {category_rank(item.category), item.name, item.season_label || ""}
  end

  defp category_rank("franchise_t20"), do: 0
  defp category_rank("international"), do: 1
  defp category_rank("domestic"), do: 2
  defp category_rank(_), do: 3

  defp normalize_map_keys(map) when is_map(map) do
    Map.new(map, fn {key, value} -> {to_string(key), value} end)
  end

  defp normalize_map_keys(_), do: %{}

  defp cache_key(provider_id), do: "sportmonks_cricket_competitions_cache:" <> provider_id
  defp cache_ts_key(provider_id), do: "sportmonks_cricket_competitions_cached_at:" <> provider_id

  defp normalize_base_url(url) when is_binary(url) do
    case String.trim(url) do
      "https://api.sportmonks.com/v3/cricket" -> @default_base_url
      "https://api.sportmonks.com/v3/cricket/" -> @default_base_url
      other -> String.trim_trailing(other, "/")
    end
  end

  defp normalize_base_url(_), do: @default_base_url

  defp fresh_cache?(provider_id) do
    with cached_at when is_binary(cached_at) <- Settings.get(cache_ts_key(provider_id), nil),
         {:ok, dt, _} <- DateTime.from_iso8601(cached_at) do
      DateTime.diff(DateTime.utc_now(), dt) < @cache_ttl_seconds
    else
      _ -> false
    end
  end

  defp slugify(parts) do
    parts
    |> List.wrap()
    |> Enum.join("-")
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, "-")
    |> String.trim("-")
  end

  defp first_present(values) when is_list(values) do
    Enum.find(values, fn
      nil -> false
      "" -> false
      _ -> true
    end)
  end

  defp present_string(nil), do: nil

  defp present_string(value) when is_binary(value) do
    value = String.trim(value)
    if value == "", do: nil, else: value
  end

  defp present_string(value), do: value |> to_string() |> present_string()
end
