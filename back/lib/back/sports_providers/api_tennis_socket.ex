defmodule Back.SportsProviders.ApiTennisSocket do
  use WebSockex

  require Logger

  alias Back.Providers
  alias Back.SportsData
  alias Back.SportsData.Parser
  alias Back.SportsData.Redactor
  alias Back.SportsProviders.ApiTennis
  alias Back.Tennis
  alias Back.Tennis.Workers.LiveSyncWorker
  alias Back.Workers.TennisFetchWorker

  @base_ws_url "wss://wss.api-tennis.com/live"
  @initial_backoff 1_000
  @max_backoff 30_000
  @ping_interval_ms 20_000

  def start_link(_arg) do
    with {:ok, provider} <- fetch_provider(),
         {:ok, api_key} <- fetch_api_key(provider) do
      base_ws_url = provider.socket_url || @base_ws_url
      url = "#{base_ws_url}?APIkey=#{api_key}&timezone=UTC"

      WebSockex.start_link(
        url,
        __MODULE__,
        %{
          backoff_ms: @initial_backoff,
          disconnected_at: nil,
          ping_ref: nil
        },
        handle_initial_conn_failure: true
      )
    else
      {:error, :provider_not_found} -> :ignore
      {:error, :provider_not_configured} -> :ignore
      {:error, :missing_api_tennis_key} -> :ignore
      {:error, :provider_not_enabled} -> :ignore
    end
  end

  @impl true
  def handle_connect(_conn, state) do
    Logger.info("API-Tennis websocket connected")
    LiveSyncWorker.websocket_connected()
    ping_ref = schedule_ping()
    {:ok, %{state | backoff_ms: @initial_backoff, disconnected_at: nil, ping_ref: ping_ref}}
  end

  @impl true
  def handle_frame({:text, message}, state) do
    case Jason.decode(message) do
      {:ok, %{"success" => 1, "result" => result}} ->
        rows = result |> Parser.list_wrap() |> Enum.filter(&is_map/1)
        ingest_many(rows, "websocket:result")

      {:ok, %{} = event} ->
        ingest_many([event], "websocket:event")

      {:error, reason} ->
        Logger.error("API-Tennis websocket decode failed: #{inspect(Redactor.redact(reason))}")

      _ ->
        :ok
    end

    {:ok, state}
  end

  @impl true
  def handle_frame({:pong, _payload}, state) do
    {:ok, state}
  end

  @impl true
  def handle_info(:send_ping, state) do
    ping_ref = schedule_ping()
    {:reply, {:ping, ""}, %{state | ping_ref: ping_ref}}
  end

  @impl true
  def handle_disconnect(disconnect, state) do
    reason =
      case disconnect do
        %{reason: value} -> value
        value -> value
      end

    now = System.system_time(:second)
    disconnected_at = state.disconnected_at || now

    Logger.error("API-Tennis websocket disconnected: #{inspect(Redactor.redact(reason))}")
    LiveSyncWorker.websocket_disconnected()
    clear_ping(state.ping_ref)

    if now - disconnected_at >= 60 do
      enqueue_rest_fallback()
    end

    backoff = min(state.backoff_ms, @max_backoff)
    Process.sleep(backoff)

    {:reconnect,
     %{
       state
       | disconnected_at: disconnected_at,
         backoff_ms: min(backoff * 2, @max_backoff),
         ping_ref: nil
     }}
  end

  defp ingest_many(rows, source) do
    {ok_count, error_count} =
      Enum.reduce(rows, {0, 0}, fn row, {ok_acc, error_acc} ->
        event = ApiTennis.normalize_websocket_event(row)

        case {SportsData.upsert_event(event), Tennis.ingest_websocket_update(row)} do
          {{:ok, _}, {:ok, _}} -> {ok_acc + 1, error_acc}
          _ -> {ok_acc, error_acc + 1}
        end
      end)

    _ =
      SportsData.log_sync(%{
        provider: :api_tennis,
        source: source,
        status: status_from_counts(ok_count, error_count),
        fetched_count: ok_count + error_count,
        upserted_count: ok_count,
        failed_count: error_count
      })

    :ok
  end

  defp enqueue_rest_fallback do
    _ = Oban.insert(TennisFetchWorker.new(%{"reason" => "api_tennis_websocket_down"}))
    :ok
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

  defp status_from_counts(0, _), do: :failure
  defp status_from_counts(_, 0), do: :success
  defp status_from_counts(_, _), do: :partial

  defp schedule_ping do
    Process.send_after(self(), :send_ping, @ping_interval_ms)
  end

  defp clear_ping(nil), do: :ok
  defp clear_ping(ref), do: Process.cancel_timer(ref, async: false, info: false)
end
