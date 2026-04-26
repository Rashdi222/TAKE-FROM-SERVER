defmodule Back.SportsProviders.Goalserve do
  @behaviour Back.SportsProviders.Behaviour

  require Logger

  alias Back.Providers
  alias Back.SportsData.Parser
  alias Back.SportsData.Redactor

  @default_base_url "http://www.goalserve.com/getfeed"

  @impl true
  def fetch_fixtures(opts \\ []) do
    opts = normalize_opts(opts)
    region = Keyword.get(opts, :region, "uk")
    timezone = Keyword.get(opts, :timezone, "Europe/London")

    with {:ok, body} <- request("racing/#{region}", json: 1),
         {:ok, races} <- parse_races(body, timezone) do
      {:ok, races}
    end
  end

  @impl true
  def fetch_live(opts \\ []) do
    opts = normalize_opts(opts)

    with {:ok, rows} <- fetch_fixtures(opts) do
      {:ok, Enum.filter(rows, &(&1.status == :live))}
    end
  end

  def get_results(date, opts \\ []) do
    opts = normalize_opts(opts)
    timezone = Keyword.get(opts, :timezone, "Europe/London")

    with {:ok, body} <- request("racing/results/#{Date.to_string(date)}", json: 1),
         {:ok, races} <- parse_races(body, timezone) do
      {:ok, races}
    end
  end

  def normalize_webhook_event(%{"eventId" => event_id, "data" => data} = payload)
      when is_map(data) do
    normalize_webhook_event(event_id, data, payload)
  end

  def normalize_webhook_event(%{"event_id" => event_id, "data" => data} = payload)
      when is_map(data) do
    normalize_webhook_event(event_id, data, payload)
  end

  def normalize_webhook_event(%{"data" => data} = payload) when is_map(data) do
    event_id = data["id"] || data["event_id"] || data["race_id"]
    normalize_webhook_event(event_id, data, payload)
  end

  defp request(path, params) do
    with {:ok, key} <- fetch_api_key(params),
         base_url <- fetch_base_url(params) do
      url = "#{base_url}/#{key}/#{path}"

      case Req.get(url, params: params, headers: [{"Accept", "application/json"}]) do
        {:ok, %{status: status, body: body}} when status in 200..299 ->
          {:ok, body}

        {:ok, %{status: status, body: body}} ->
          Logger.error("Goalserve HTTP error #{status}: #{inspect(Redactor.redact(body))}")
          {:error, {:http_error, status, body}}

        {:error, reason} ->
          Logger.error("Goalserve request failed: #{inspect(Redactor.redact(reason))}")
          {:error, reason}
      end
    end
  end

  defp fetch_api_key(opts) do
    case Keyword.get(opts, :api_key) || Keyword.get(opts, "api_key") do
      value when is_binary(value) and value != "" ->
        {:ok, String.trim(value)}

      _ ->
        fetch_api_key_from_provider()
    end
  end

  defp fetch_api_key_from_provider do
    case Providers.get_enabled_provider_by_name("goalserve") do
      {:ok, provider} ->
        case provider.api_key |> to_string() |> String.trim() do
          "" -> {:error, :missing_goalserve_key}
          key -> {:ok, key}
        end

      _ ->
        {:error, :missing_goalserve_key}
    end
  end

  defp fetch_provider_base_url do
    case Providers.get_enabled_provider_by_name("goalserve") do
      {:ok, provider} ->
        provider.base_url
        |> to_string()
        |> String.trim()
        |> case do
          "" -> @default_base_url
          value -> String.trim_trailing(value, "/")
        end

      _ ->
        @default_base_url
    end
  end

  defp fetch_base_url(opts) do
    case Keyword.get(opts, :base_url) || Keyword.get(opts, "base_url") do
      value when is_binary(value) and value != "" -> String.trim_trailing(value, "/")
      _ -> fetch_provider_base_url()
    end
  end

  defp parse_races(body, timezone) when is_map(body) do
    races =
      body
      |> get_in(["scores", "tournament"])
      |> Parser.list_wrap()
      |> Enum.flat_map(fn tournament ->
        tournament
        |> Map.get("race", [])
        |> Parser.list_wrap()
        |> Enum.map(&normalize_race(tournament, &1, timezone))
      end)

    {:ok, races}
  rescue
    error ->
      Logger.error("Goalserve parse error: #{inspect(Redactor.redact(error))}")
      {:error, :invalid_response_shape}
  end

  defp parse_races(_body, _timezone), do: {:error, :invalid_response_shape}

  defp normalize_race(tournament, race, timezone) do
    %{
      provider: :goalserve,
      provider_event_id: Parser.to_string_or_nil(race["id"]),
      sport: :horse_racing,
      competition_name: compose_competition_name(tournament, race),
      status: map_status(race["status"]),
      start_time_utc: Parser.parse_goalserve_datetime(race["datetime"], timezone),
      participants: map_runners(race),
      result: parse_results(race["results"]),
      raw: %{
        tournament: tournament,
        race: race
      }
    }
  end

  defp compose_competition_name(tournament, race) do
    tournament_name = Parser.compact_string(tournament["name"]) || "Unknown tournament"
    race_name = Parser.compact_string(race["name"]) || "Unknown race"
    "#{tournament_name} - #{race_name}"
  end

  defp map_status(""), do: :scheduled
  defp map_status(nil), do: :scheduled
  defp map_status("Open"), do: :live
  defp map_status("Result"), do: :finished
  defp map_status("Abandoned"), do: :cancelled
  defp map_status(_), do: :unknown

  defp map_runners(race) do
    horse_list =
      race["horse"] ||
        get_in(race, ["runners", "horse"]) ||
        []

    horse_list
    |> Parser.list_wrap()
    |> Enum.map(fn horse ->
      %{
        name: horse["name"],
        role: "runner",
        number: Parser.to_int(horse["number"]),
        jockey: horse["jockey"],
        trainer: horse["trainer"],
        provider_id: Parser.to_string_or_nil(horse["id"]),
        weight: horse["wgt"],
        rating: horse["rating"]
      }
    end)
  end

  defp parse_results(nil), do: nil
  defp parse_results(results) when results in [%{}, []], do: nil

  defp parse_results(results) when is_map(results) do
    rows =
      results
      |> Map.get("result", [])
      |> Parser.list_wrap()
      |> Enum.filter(&is_map/1)

    if rows == [] or Enum.all?(rows, &(is_nil(&1["position"]) and is_nil(&1["horse_id"]))) do
      nil
    else
      %{
        positions:
          Enum.map(rows, fn row ->
            %{
              position: row["position"],
              horse_id: row["horse_id"],
              name: row["name"]
            }
          end)
      }
    end
  end

  defp parse_results(_), do: nil

  defp normalize_webhook_event(nil, _data, _payload), do: {:error, :missing_event_id}

  defp normalize_webhook_event(event_id, data, payload) do
    timezone = payload["timezone"] || "Europe/London"

    participants =
      map_runners(%{
        "horse" => data["horse"] || get_in(data, ["runners", "horse"]) || []
      })

    {:ok,
     %{
       provider: :goalserve,
       provider_event_id: Parser.to_string_or_nil(event_id),
       sport: :horse_racing,
       competition_name:
         data["competition_name"] || data["meeting"] || data["tournament"] || "Goalserve Webhook",
       status: map_status(data["status"]),
       start_time_utc:
         Parser.parse_goalserve_datetime(data["datetime"] || data["start_time"], timezone),
       participants: participants,
       result: parse_results(data["results"]),
       raw: payload
     }}
  end

  defp normalize_opts(opts) when is_list(opts), do: opts

  defp normalize_opts(opts) when is_map(opts) do
    opts
    |> Enum.map(fn
      {"region", v} -> {:region, v}
      {"timezone", v} -> {:timezone, v}
      {"api_key", v} -> {:api_key, v}
      {"base_url", v} -> {:base_url, v}
      {k, v} -> {k, v}
    end)
  end
end
