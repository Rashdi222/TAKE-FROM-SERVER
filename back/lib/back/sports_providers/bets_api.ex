defmodule Back.SportsProviders.BetsApi do
  @behaviour Back.SportsProviders.Behaviour

  require Logger

  alias Back.Providers
  alias Back.SportsData.Parser
  alias Back.SportsData.Redactor

  @default_primary_url "https://api.b365api.com"
  @default_fallback_url "https://api.betsapi.com"

  @greyhound_sport_id 78
  @horse_racing_sport_id 16
  @tennis_sport_id 13

  @impl true
  def fetch_fixtures(opts \\ []) do
    opts = normalize_opts(opts)
    page = Keyword.get(opts, :page, 1)
    get_events(:upcoming, @greyhound_sport_id, page)
  end

  @impl true
  def fetch_live(_opts \\ []) do
    get_events(:inplay, @greyhound_sport_id, 1)
  end

  def configured? do
    case Providers.get_enabled_provider_by_name("betsapi") do
      {:ok, provider} ->
        provider.api_key |> to_string() |> String.trim() != ""

      _ ->
        false
    end
  end

  def fetch_ended(opts \\ []) do
    opts = normalize_opts(opts)
    page = Keyword.get(opts, :page, 1)
    get_events(:ended, @greyhound_sport_id, page)
  end

  def fetch_upcoming_tennis(opts \\ []) do
    opts = normalize_opts(opts)
    page = Keyword.get(opts, :page, 1)
    get_events(:upcoming, @tennis_sport_id, page)
  end

  def fetch_upcoming_horse_racing(opts \\ []) do
    opts = normalize_opts(opts)
    page = Keyword.get(opts, :page, 1)
    get_events(:upcoming, @horse_racing_sport_id, page)
  end

  def get_event_detail(event_id) do
    params = [event_id: event_id]

    with {:ok, body, _headers} <- request_with_fallback("/v1/event/view", params),
         {:ok, event} <- extract_single_event(body) do
      {:ok, normalize_event(event)}
    end
  end

  def search_events(opts) when is_list(opts) do
    with {:ok, body, _headers} <- request_with_fallback("/v1/events/search", opts),
         {:ok, events, _pager} <- extract_events(body) do
      {:ok, Enum.map(events, &normalize_event/1)}
    end
  end

  def search_events(opts) when is_map(opts), do: search_events(normalize_opts(opts))

  def get_events(type, sport_id, page \\ 1) when type in [:upcoming, :inplay, :ended] do
    endpoint =
      case type do
        :upcoming -> "/v1/events/upcoming"
        :inplay -> "/v1/events/inplay"
        :ended -> "/v1/events/ended"
      end

    params = [sport_id: sport_id, page: page]

    with {:ok, body, headers} <- request_with_fallback(endpoint, params),
         :ok <- check_rate_limit(headers),
         {:ok, events, _pager} <- extract_events(body) do
      {:ok, Enum.map(events, &normalize_event/1)}
    end
  end

  def get_all_pages(type, sport_id) when type in [:upcoming, :ended] do
    do_get_all_pages(type, sport_id, 1, [])
  end

  defp do_get_all_pages(type, sport_id, page, acc) do
    with {:ok, body, headers} <-
           request_with_fallback(path_for(type), sport_id: sport_id, page: page),
         :ok <- check_rate_limit(headers),
         {:ok, events, pager} <- extract_events(body) do
      merged = acc ++ Enum.map(events, &normalize_event/1)

      if has_next_page?(pager) do
        next_page = (Parser.to_int(pager["page"]) || page) + 1
        do_get_all_pages(type, sport_id, next_page, merged)
      else
        {:ok, merged}
      end
    end
  end

  defp path_for(:upcoming), do: "/v1/events/upcoming"
  defp path_for(:ended), do: "/v1/events/ended"

  defp request_with_fallback(endpoint, params) do
    with {:ok, token} <- fetch_token(params) do
      request_params = [token: token] ++ params

      case Req.get(primary_url(params) <> endpoint, params: request_params) do
        {:ok, %{status: status, body: body, headers: headers}} when status in 200..299 ->
          {:ok, body, headers}

        {:ok, %{status: 429, headers: headers}} ->
          {:error, {:rate_limited, rate_limit_reset(headers)}}

        {:ok, %{status: status, body: body}} ->
          Logger.error("BetsAPI primary failed #{status}, trying fallback")
          request_fallback(endpoint, request_params, status, body)

        {:error, reason} ->
          Logger.error(
            "BetsAPI primary request error, trying fallback: #{inspect(Redactor.redact(reason))}"
          )

          request_fallback(endpoint, request_params, :request_error, reason)
      end
    end
  end

  defp request_fallback(endpoint, params, _primary_status, _primary_body) do
    case Req.get(fallback_url(params) <> endpoint, params: params) do
      {:ok, %{status: status, body: body, headers: headers}} when status in 200..299 ->
        {:ok, body, headers}

      {:ok, %{status: 429, headers: headers}} ->
        {:error, {:rate_limited, rate_limit_reset(headers)}}

      {:ok, %{status: status, body: body}} ->
        Logger.error("BetsAPI fallback HTTP error #{status}: #{inspect(Redactor.redact(body))}")
        {:error, {:http_error, status, body}}

      {:error, reason} ->
        Logger.error("BetsAPI fallback request failed: #{inspect(Redactor.redact(reason))}")
        {:error, reason}
    end
  end

  defp fetch_token(params) do
    opts = normalize_opts(params)

    case Keyword.get(opts, :token) || Keyword.get(opts, :api_key) do
      value when is_binary(value) and value != "" ->
        {:ok, String.trim(value)}

      _ ->
        fetch_token_from_provider()
    end
  end

  defp fetch_token_from_provider do
    case Providers.get_enabled_provider_by_name("betsapi") do
      {:ok, provider} ->
        case provider.api_key |> to_string() |> String.trim() do
          "" -> {:error, :missing_betsapi_token}
          token -> {:ok, token}
        end

      _ ->
        {:error, :missing_betsapi_token}
    end
  end

  defp primary_url(params) do
    opts = normalize_opts(params)

    case Keyword.get(opts, :base_url) do
      value when is_binary(value) and value != "" ->
        value
        |> to_string()
        |> String.trim_trailing("/")

      _ ->
        fetch_provider_base_url()
    end
  end

  defp fallback_url(params) do
    opts = normalize_opts(params)

    case Keyword.get(opts, :fallback_url) do
      value when is_binary(value) and value != "" ->
        value
        |> to_string()
        |> String.trim_trailing("/")

      _ ->
        fetch_provider_fallback_url()
    end
  end

  defp fetch_provider_base_url do
    case Providers.get_enabled_provider_by_name("betsapi") do
      {:ok, provider} ->
        provider.base_url
        |> to_string()
        |> String.trim()
        |> case do
          "" -> @default_primary_url
          value -> String.trim_trailing(value, "/")
        end

      _ ->
        @default_primary_url
    end
  end

  defp fetch_provider_fallback_url do
    case Providers.get_enabled_provider_by_name("betsapi") do
      {:ok, provider} ->
        provider.config
        |> extract_config_value(["fallback_url", :fallback_url], @default_fallback_url)
        |> String.trim_trailing("/")

      _ ->
        @default_fallback_url
    end
  end

  defp extract_config_value(nil, _keys, default), do: default

  defp extract_config_value(config, keys, default) when is_map(config) do
    keys
    |> Enum.find_value(fn key ->
      case Map.get(config, key) do
        value when is_binary(value) and value != "" -> String.trim(value)
        _ -> nil
      end
    end)
    |> case do
      nil -> default
      value -> value
    end
  end

  defp check_rate_limit(headers) do
    remaining = header_value(headers, "x-ratelimit-remaining")

    case Parser.to_int(remaining) do
      value when is_integer(value) and value <= 0 ->
        {:error, {:rate_limited, rate_limit_reset(headers)}}

      _ ->
        :ok
    end
  end

  defp rate_limit_reset(headers) do
    headers
    |> header_value("x-ratelimit-reset")
    |> Parser.to_int()
  end

  defp header_value(headers, name) do
    headers
    |> Enum.find_value(fn {k, v} -> if String.downcase(k) == name, do: v end)
  end

  defp extract_events(%{"success" => 1} = body) do
    rows = body["results"] || body["result"] || []

    events =
      rows
      |> Parser.list_wrap()
      |> Enum.filter(&is_map/1)

    {:ok, events, body["pager"] || %{}}
  end

  defp extract_events(%{"success" => 0} = body) do
    Logger.error("BetsAPI API error: #{inspect(Redactor.redact(body))}")
    {:error, :api_error}
  end

  defp extract_events(_), do: {:error, :invalid_response_shape}

  defp extract_single_event(%{"success" => 1} = body) do
    event = body["results"] || body["result"]

    case event do
      %{} = row -> {:ok, row}
      [row | _] when is_map(row) -> {:ok, row}
      _ -> {:error, :invalid_response_shape}
    end
  end

  defp extract_single_event(%{"success" => 0} = body) do
    Logger.error("BetsAPI event view API error: #{inspect(Redactor.redact(body))}")
    {:error, :api_error}
  end

  defp extract_single_event(_), do: {:error, :invalid_response_shape}

  defp has_next_page?(%{"page" => page, "per_page" => per_page, "total" => total}) do
    page_i = Parser.to_int(page) || 1
    per_page_i = Parser.to_int(per_page) || 0
    total_i = Parser.to_int(total) || 0
    page_i * per_page_i < total_i
  end

  defp has_next_page?(_), do: false

  defp normalize_event(event) do
    sport_id = Parser.to_int(event["sport_id"])

    %{
      provider: :betsapi,
      provider_event_id: Parser.to_string_or_nil(event["id"]),
      sport: map_sport(sport_id),
      competition_name: get_in(event, ["league", "name"]) || "Unknown",
      status: map_status(to_string(event["time_status"] || "")),
      start_time_utc: Parser.unix_to_datetime(event["time"]),
      participants: [
        %{
          name: get_in(event, ["home", "name"]),
          role: "home",
          provider_id: Parser.to_string_or_nil(get_in(event, ["home", "id"]))
        },
        %{
          name: get_in(event, ["away", "name"]),
          role: "away",
          provider_id: Parser.to_string_or_nil(get_in(event, ["away", "id"]))
        }
      ],
      result: map_result(event),
      raw: event
    }
  end

  defp map_sport(@tennis_sport_id), do: :tennis
  defp map_sport(@horse_racing_sport_id), do: :horse_racing
  defp map_sport(@greyhound_sport_id), do: :greyhound
  defp map_sport(_), do: :greyhound

  defp map_result(event) do
    score = Parser.compact_string(event["ss"])
    if score, do: %{score: score}, else: nil
  end

  defp map_status("0"), do: :scheduled
  defp map_status("1"), do: :live
  defp map_status("2"), do: :finished
  defp map_status("3"), do: :finished
  defp map_status("4"), do: :cancelled
  defp map_status("5"), do: :cancelled
  defp map_status("6"), do: :cancelled
  defp map_status("7"), do: :live
  defp map_status("8"), do: :scheduled
  defp map_status("9"), do: :cancelled
  defp map_status(_), do: :unknown

  defp normalize_opts(opts) when is_list(opts), do: opts

  defp normalize_opts(opts) when is_map(opts) do
    opts
    |> Enum.map(fn
      {"page", v} -> {:page, v}
      {"sport_id", v} -> {:sport_id, v}
      {"event_id", v} -> {:event_id, v}
      {"home", v} -> {:home, v}
      {"away", v} -> {:away, v}
      {"time", v} -> {:time, v}
      {"league_id", v} -> {:league_id, v}
      {"token", v} -> {:token, v}
      {"api_key", v} -> {:api_key, v}
      {"base_url", v} -> {:base_url, v}
      {"fallback_url", v} -> {:fallback_url, v}
      {k, v} -> {k, v}
    end)
  end
end
