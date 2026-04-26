defmodule Back.SportsProviders.ApiTennis do
  @behaviour Back.SportsProviders.Behaviour

  require Logger

  alias Back.Providers
  alias Back.SportsData.Parser
  alias Back.SportsData.Redactor

  @base_url "https://api.api-tennis.com/tennis/"

  def get_event_types do
    request("get_events", [])
  end

  def get_tournaments do
    request("get_tournaments", [])
  end

  def normalize_websocket_event(event) when is_map(event), do: normalize_fixture(event)

  @impl true
  def fetch_fixtures(opts \\ []) do
    opts = normalize_opts(opts)
    date_start = Keyword.get(opts, :date_start, Date.utc_today())
    date_stop = Keyword.get(opts, :date_stop, Date.add(Date.utc_today(), 1))

    params =
      [
        date_start: Date.to_string(date_start),
        date_stop: Date.to_string(date_stop),
        timezone: "UTC"
      ] ++ compact_opts(opts)

    with {:ok, rows} <- request("get_fixtures", params) do
      {:ok, Enum.map(rows, &normalize_fixture/1)}
    end
  end

  @impl true
  def fetch_live(opts \\ []) do
    opts = normalize_opts(opts)
    params = [timezone: "UTC"] ++ compact_opts(opts)

    with {:ok, rows} <- request("get_livescore", params) do
      {:ok,
       rows
       |> Enum.filter(&live_event?/1)
       |> Enum.map(&normalize_fixture/1)}
    end
  end

  defp request(method, params) do
    with {:ok, provider} <- fetch_provider(),
         {:ok, key} <- fetch_api_key(provider) do
      base_url = provider.base_url || @base_url
      req_params = [method: method, APIkey: key] ++ params

      case Req.get(base_url, params: req_params, headers: [{"Accept", "application/json"}]) do
        {:ok, %{status: 200, body: %{"success" => 1, "result" => rows}}} when is_list(rows) ->
          {:ok, rows}

        {:ok, %{status: 200, body: %{"success" => 0} = body}} ->
          Logger.error("API-Tennis API error: #{inspect(Redactor.redact(body))}")
          {:error, :api_error}

        {:ok, %{status: status, body: body}} ->
          Logger.error("API-Tennis HTTP error #{status}: #{inspect(Redactor.redact(body))}")
          {:error, {:http_error, status, body}}

        {:error, reason} ->
          Logger.error("API-Tennis request failed: #{inspect(Redactor.redact(reason))}")
          {:error, reason}
      end
    end
  end

  defp fetch_provider do
    Providers.get_enabled_provider_by_name("api_tennis")
  end

  defp fetch_api_key(provider) do
    case provider.api_key |> to_string() |> String.trim() do
      "" -> {:error, :missing_api_tennis_key}
      key -> {:ok, key}
    end
  end

  defp normalize_fixture(event) do
    %{
      provider: :api_tennis,
      provider_event_id: Parser.to_string_or_nil(event["event_key"]),
      sport: :tennis,
      competition_name: event["tournament_name"] || event["event_type_type"] || "Unknown",
      status: map_status(event),
      start_time_utc: Parser.parse_iso_date_time_utc(event["event_date"], event["event_time"]),
      participants: [
        %{
          name: event["event_first_player"],
          role: "player_1",
          provider_id: Parser.to_string_or_nil(event["first_player_key"])
        },
        %{
          name: event["event_second_player"],
          role: "player_2",
          provider_id: Parser.to_string_or_nil(event["second_player_key"])
        }
      ],
      result: map_result(event),
      raw: event
    }
  end

  defp map_result(event) do
    winner = Parser.compact_string(event["event_winner"])

    if winner do
      %{
        winner: winner,
        final_result: Parser.compact_string(event["event_final_result"]),
        game_result: Parser.compact_string(event["event_game_result"]),
        scores: event["scores"] || []
      }
    else
      nil
    end
  end

  defp map_status(%{"event_live" => value}) when value in [1, "1", true, "true"], do: :live
  defp map_status(%{"event_status" => "Finished"}), do: :finished

  defp map_status(%{"event_status" => status}) when status in [nil, ""],
    do: :scheduled

  defp map_status(_), do: :live

  defp live_event?(%{"event_live" => value}) when value in [1, "1", true, "true"], do: true

  defp live_event?(%{"event_status" => status}) when is_binary(status) do
    normalized = status |> String.downcase() |> String.trim()
    String.contains?(normalized, "set") or String.contains?(normalized, "live")
  end

  defp live_event?(_), do: false

  defp compact_opts(opts) when is_map(opts), do: opts |> Map.to_list() |> compact_opts()

  defp compact_opts(opts) when is_list(opts) do
    opts
    |> Enum.reject(fn {k, _v} ->
      k in [:date_start, :date_stop, :timezone, "date_start", "date_stop", "timezone"]
    end)
    |> Enum.reject(fn {_k, v} -> is_nil(v) end)
  end

  defp normalize_opts(opts) when is_list(opts), do: opts

  defp normalize_opts(opts) when is_map(opts) do
    opts
    |> Enum.map(fn
      {"date_start", v} -> {:date_start, v}
      {"date_stop", v} -> {:date_stop, v}
      {"timezone", v} -> {:timezone, v}
      {k, v} -> {k, v}
    end)
  end
end
