defmodule Back.MultiSource.ScraperActionResultConsumer do
  use GenServer

  require Logger

  @channel "control:scraper-action-results"
  @subscribe_retry_ms 2_000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(opts) do
    state = %{
      pubsub_name: Keyword.get(opts, :pubsub_name, Back.MultiSource.RedisPubSub),
      channel: Keyword.get(opts, :channel, @channel),
      subscribed?: false
    }

    send(self(), :subscribe)
    {:ok, state}
  end

  @impl true
  def handle_info(:subscribe, state) do
    case Redix.PubSub.subscribe(state.pubsub_name, state.channel, self()) do
      {:ok, _ref} ->
        Logger.info("scraper action result consumer subscribed to #{state.channel}")
        {:noreply, %{state | subscribed?: true}}

      {:error, reason} ->
        Logger.warning("scraper action result subscribe failed: #{inspect(reason)}")
        Process.send_after(self(), :subscribe, @subscribe_retry_ms)
        {:noreply, %{state | subscribed?: false}}
    end
  end

  def handle_info(
        {:redix_pubsub, _pubsub, _ref, :message, %{channel: @channel, payload: payload}},
        state
      ) do
    case Jason.decode(payload) do
      {:ok, %{"match_id" => match_id} = decoded} when is_binary(match_id) ->
        _ = Back.MultiSource.record_source_refresh_result(decoded)

      {:ok, _decoded} ->
        Logger.warning("ignored scraper action result without match_id")

      {:error, reason} ->
        Logger.warning("ignored malformed scraper action result: #{inspect(reason)}")
    end

    {:noreply, state}
  end

  def handle_info({:redix_pubsub, _pubsub, _ref, type, reason}, state)
      when type in [:disconnected, :connection_error] do
    Logger.warning("scraper action result consumer degraded: #{inspect(reason)}")
    {:noreply, %{state | subscribed?: false}}
  end

  def handle_info(_message, state), do: {:noreply, state}
end
